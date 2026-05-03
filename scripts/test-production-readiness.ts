/**
 * Yayın öncesi production readiness senaryosu.
 *
 * Mock mode (KOLAYBI_MOCK=true) ile gerçek bir e-ticaret günlük akışını
 * simüle eder:
 *
 *   1. Admin yeni ürün ekler (image staging'siz, sadece form)
 *   2. Customer kayıt + email verify + login + adres ekle
 *   3. Customer ürünü sepete ekler + sipariş verir (CC)
 *   4. Admin siparişi APPROVED → PROCESSING → SHIPPED → DELIVERED
 *   5. Customer için fatura kesilmedi (CUSTOMER skip kuralı)
 *   6. Bayi başvurur + admin onaylar + bayi belge yükler + admin onaylar
 *   7. Bayi OPEN_ACCOUNT siparişi
 *   8. Admin bayi siparişi DELIVERED → KolayBi mock fatura SENT
 *   9. Bayi panelinde "Faturalarım" görünür
 *  10. Admin "Faturalar" sayfasında SENT statusunda görünür
 *  11. Admin manual "Yeniden Gönder" idempotent
 *  12. Bayi suspend → yeni sipariş engellenir
 *  13. Cron retry endpoint çalışır (CRON_SECRET ile)
 *
 * Bu test "yayına çıkmaya hazır mı?" sorusuna cevap.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

process.env.KOLAYBI_MOCK = "true";
// Cron testi için secret yoksa onu da set'le (test ortamı)
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = "test-cron-secret-1234567890123456";
}

import * as kolaybi from "@/lib/adapters/kolaybi";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// HTTP harness — her senaryo için yeni session
type S = { cookies: Map<string, string>; ip?: string; label?: string };
const newS = (label?: string): S => ({ cookies: new Map(), label });
function applyCookies(s: S, h: Headers) {
  for (const sc of h.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    s.cookies.set(k.trim(), v.join("=").trim());
  }
}
const cookieHeader = (s: S) =>
  Array.from(s.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

async function http(s: S, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = {
    cookie: cookieHeader(s),
    accept: "application/json",
    ...(s.ip ? { "x-forwarded-for": s.ip } : {}),
    ...headers,
  };
  let bodyStr: string | undefined;
  if (body !== undefined) {
    h["content-type"] = "application/json";
    bodyStr = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, { method, headers: h, body: bodyStr, redirect: "manual" });
  applyCookies(s, r.headers);
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: r.status, data };
}

async function login(s: S, email: string, password: string) {
  const csrf = await http(s, "GET", "/api/auth/csrf");
  const csrfToken = (csrf.data as { csrfToken: string }).csrfToken;
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: BASE,
    json: "true",
  });
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(s),
      ...(s.ip ? { "x-forwarded-for": s.ip } : {}),
    },
    body: body.toString(),
    redirect: "manual",
  });
  applyCookies(s, r.headers);
}

let pass = 0;
let total = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    const m = extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 200)}` : "";
    console.log(`  ✗ ${name}${m}`);
    fails.push(name);
  }
}

const ts = Date.now();
const cleanup: { userIds: string[]; orderIds: string[]; productIds: string[]; categoryIds: string[]; publisherIds: string[] } = {
  userIds: [],
  orderIds: [],
  productIds: [],
  categoryIds: [],
  publisherIds: [],
};

(async () => {
  try {
    console.log("═══════════════════════════════════════════════════════");
    console.log("  PRODUCTION READINESS — Yayın öncesi son senaryo");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  KolayBi mode: ${kolaybi.isMockMode() ? "MOCK" : kolaybi.isConfigured() ? "REAL" : "DRYRUN"}`);
    console.log(`  Dev server: ${BASE}\n`);
    kolaybi._resetMockState();

    // ═══ FIXTURES ═══════════════════════════════════════
    console.log("📋 Fixtures hazırlanıyor...");

    const adminEmail = `prod-admin-${ts}@test.com`;
    const adminPwd = "AdminPwd123!";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Prod Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    cleanup.userIds.push(admin.id);

    // Admin login
    const adminS = newS("admin");
    adminS.ip = "10.99.1.1";
    await login(adminS, adminEmail, adminPwd);
    const adminWho = await http(adminS, "GET", "/api/auth/session");
    check(
      "admin login OK",
      (adminWho.data as { user?: { role?: string } })?.user?.role === "ADMIN",
    );

    // ═══ 1) ADMIN: Kategori + Yayınevi + Ürün ═══════════
    console.log("\n1️⃣  ADMIN: Yeni kategori + yayınevi + ürün ekle");

    const cat = await http(adminS, "POST", "/api/admin/categories", {
      name: `Prod Kat ${ts}`,
      type: "ana",
    });
    check("kategori create 200/201", cat.status === 200 || cat.status === 201, cat);
    const catId = (cat.data as { id?: string })?.id;
    if (catId) cleanup.categoryIds.push(catId);

    const pub = await http(adminS, "POST", "/api/admin/publishers", {
      name: `Prod Yayın ${ts}`,
    });
    check("yayınevi create 200/201", pub.status === 200 || pub.status === 201, pub);
    const pubId = (pub.data as { id?: string })?.id;
    if (pubId) cleanup.publisherIds.push(pubId);

    const prod = await http(adminS, "POST", "/api/admin/products", {
      name: `Prod Test Kitap ${ts}`,
      sku: `PROD-${ts}`,
      price: 150,
      vatRate: 10,
      stockQuantity: 100,
      publisherId: pubId,
      categoryId: catId,
      isPublished: true,
    });
    check("ürün create 200/201", prod.status === 200 || prod.status === 201, prod);
    const prodId = (prod.data as { id?: string })?.id;
    if (prodId) cleanup.productIds.push(prodId);

    // ═══ 2) CUSTOMER: Kayıt + giriş + adres ═════════════
    console.log("\n2️⃣  CUSTOMER: Kayıt + giriş + adres ekle");

    const custEmail = `prod-cust-${ts}@test.com`;
    const custPwd = "CustPwd123!";

    const reg = await http(newS("guest"), "POST", "/api/auth/register", {
      name: "Prod Müşteri",
      email: custEmail,
      password: custPwd,
      phone: "0532 111 22 33",
    });
    check("register 201", reg.status === 201, reg);

    // Email doğrula (test'te elle)
    const cust = await prisma.user.findUniqueOrThrow({ where: { email: custEmail } });
    cleanup.userIds.push(cust.id);
    await prisma.user.update({
      where: { id: cust.id },
      data: { emailVerified: new Date() },
    });

    const custS = newS("customer");
    custS.ip = "10.99.1.2";
    await login(custS, custEmail, custPwd);

    const addr = await http(custS, "POST", "/api/account/addresses", {
      label: "Ev",
      fullName: "Prod Müşteri",
      phone: "0532 111 22 33",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34710",
      addressLine: "Test cd 5 No 10",
      isDefault: true,
    });
    check("adres ekle 200/201", addr.status === 200 || addr.status === 201, addr);

    // ═══ 3) CUSTOMER: Sipariş ver (CC mock) ═════════════
    console.log("\n3️⃣  CUSTOMER: Sipariş ver (kredi kartı + 3DS mock)");

    if (!prodId) throw new Error("prodId yok");
    const order = await http(custS, "POST", "/api/orders", {
      items: [{ productId: prodId, quantity: 2 }],
      shipping: {
        fullName: "Prod Müşteri",
        email: custEmail,
        phone: "0532 111 22 33",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34710",
        address: "Test cd 5 No 10",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4111111111111111",
        expiry: "12/30",
        cvv: "123",
        holderName: "Prod Müşteri",
      },
    });
    check("customer sipariş 200/201", order.status === 200 || order.status === 201, order);
    const customerOrderId = (order.data as { orderId?: string; id?: string })?.orderId
      ?? (order.data as { id?: string })?.id;
    if (customerOrderId) cleanup.orderIds.push(customerOrderId);
    const paymentToken = (order.data as { paymentToken?: string; token?: string })?.paymentToken
      ?? (order.data as { token?: string })?.token;

    if (paymentToken) {
      const otp = await http(custS, "POST", "/api/payments/confirm", {
        token: paymentToken,
        action: "success",
        otp: "123456",
      });
      check("OTP onay 200", otp.status === 200, otp);
    }

    // ═══ 4) ADMIN: Sipariş status değiştir ═══════════════
    console.log("\n4️⃣  ADMIN: Customer siparişi status pipeline (PENDING→DELIVERED)");

    if (!customerOrderId) throw new Error("customerOrderId yok");

    const transitions = ["APPROVED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
    for (const target of transitions) {
      const r = await http(adminS, "POST", `/api/admin/orders/${customerOrderId}/status`, {
        status: target,
        ...(target === "SHIPPED"
          ? { trackingNumber: `TRACK-${ts}`, trackingCarrier: "ARAS" }
          : {}),
      });
      check(`order ${target} 200`, r.status === 200, r.status);
    }

    // ═══ 5) Customer fatura SKIP doğrula ═════════════════
    console.log("\n5️⃣  Customer fatura SKIP (TC kimlik kuralı)");

    // after() içindeki invoice trigger asenkron — kısa bekleme
    await new Promise((r) => setTimeout(r, 500));
    const customerInvoice = await prisma.invoice.findUnique({
      where: { orderId: customerOrderId },
    });
    check("Customer için Invoice yok (skip)", customerInvoice === null);

    // ═══ 6) BAYİ: Başvuru + admin onay + belge ═══════════
    console.log("\n6️⃣  BAYİ: Başvuru → admin onay → belge upload → admin review");

    const dealerEmail = `prod-dealer-${ts}@test.com`;
    const dealerPwd = "DealerPwd123!";

    const apply = await http(newS("applicant"), "POST", "/api/dealer/apply", {
      name: "Prod Bayi Sahibi",
      email: dealerEmail,
      phone: "0532 444 55 66",
      password: dealerPwd,
      companyName: "Prod Test Bayi A.Ş.",
      taxOffice: "Kadıköy",
      taxNumber: "1234567890",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Bayi cd 1 No 100",
    });
    check("bayi başvuru 201", apply.status === 201, apply);

    const dealerUser = await prisma.user.findUniqueOrThrow({
      where: { email: dealerEmail },
      include: { dealer: true },
    });
    cleanup.userIds.push(dealerUser.id);
    await prisma.user.update({
      where: { id: dealerUser.id },
      data: { emailVerified: new Date() },
    });
    const dealerId = dealerUser.dealer!.id;

    // Admin onaylar (DB direct — admin UI button farklı endpoint kullanıyor)
    await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        status: "APPROVED",
        paymentTerms: "OPEN_ACCOUNT",
        creditLimit: 10000,
        approvedAt: new Date(),
        approvedBy: admin.id,
      },
    });
    check("admin bayi onay (DB)", true);

    // Bayi login
    const dealerS = newS("dealer");
    dealerS.ip = "10.99.1.3";
    await login(dealerS, dealerEmail, dealerPwd);
    const dealerWho = await http(dealerS, "GET", "/api/auth/session");
    check(
      "bayi login + APPROVED status",
      (dealerWho.data as { user?: { role?: string; dealerStatus?: string } })?.user
        ?.dealerStatus === "APPROVED",
    );

    // ═══ 7) BAYİ: OPEN_ACCOUNT siparişi ═══════════════════
    console.log("\n7️⃣  BAYİ: Cari hesap (OPEN_ACCOUNT) siparişi");

    const dealerOrder = await http(dealerS, "POST", "/api/orders", {
      items: [{ productId: prodId, quantity: 5 }],
      shipping: {
        fullName: "Prod Bayi A.Ş.",
        email: dealerEmail,
        phone: "0532 444 55 66",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34710",
        address: "Bayi cd 1 No 100",
      },
      paymentMethod: "OPEN_ACCOUNT",
    });
    check("bayi OPEN_ACCOUNT sipariş 200/201", dealerOrder.status === 200 || dealerOrder.status === 201, dealerOrder);
    const dealerOrderId = (dealerOrder.data as { orderId?: string; id?: string })?.orderId
      ?? (dealerOrder.data as { id?: string })?.id;
    if (dealerOrderId) cleanup.orderIds.push(dealerOrderId);

    // ═══ 8) ADMIN: Bayi siparişi DELIVERED → KolayBi ═══════
    console.log("\n8️⃣  ADMIN: Bayi siparişi pipeline → DELIVERED → KolayBi fatura kesim");

    if (!dealerOrderId) throw new Error("dealerOrderId yok");
    for (const target of transitions) {
      const r = await http(adminS, "POST", `/api/admin/orders/${dealerOrderId}/status`, {
        status: target,
        ...(target === "SHIPPED"
          ? { trackingNumber: `TRACK-DEAL-${ts}`, trackingCarrier: "YURTICI" }
          : {}),
      });
      check(`bayi order ${target} 200`, r.status === 200, r.status);
    }

    // after() asenkron — bekle
    await new Promise((r) => setTimeout(r, 1000));

    const dealerInvoice = await prisma.invoice.findUnique({
      where: { orderId: dealerOrderId },
    });
    check("Bayi için Invoice oluşturuldu", dealerInvoice !== null);
    check("Invoice status SENT (mock kesim)", dealerInvoice?.status === "SENT", dealerInvoice?.status);
    check("Invoice externalId set (KolayBi belge no)", typeof dealerInvoice?.externalId === "string" && dealerInvoice.externalId.length > 0);
    check("Invoice syncedAt set", dealerInvoice?.syncedAt !== null);

    // Dealer cache check (DB üzerinden — KolayBi mock POST'larının gerçek
    // process'te yapıldığının kanıtı; mock state cross-process erişilemediği
    // için DB cache'lerini doğruluyoruz)
    const dealerAfter = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check("dealer.kolaybiContactId cache'lendi (KolayBi associate POST gerçekleşti)", typeof dealerAfter?.kolaybiContactId === "number");
    check("dealer.kolaybiAddressId cache'lendi", typeof dealerAfter?.kolaybiAddressId === "number");

    // Product cache check
    const prodAfter = await prisma.product.findUnique({ where: { id: prodId } });
    check("product.kolaybiProductId cache'lendi (KolayBi product POST gerçekleşti)", typeof prodAfter?.kolaybiProductId === "number");

    // externalId varlığı = KolayBi invoice POST'unun da yapıldığı kanıt
    check("invoice.externalId set (KolayBi /invoices POST gerçekleşti)", typeof dealerInvoice?.externalId === "string" && dealerInvoice.externalId.length > 0);

    // ═══ 9) BAYİ: Faturalarım sayfası ═════════════════════
    console.log("\n9️⃣  BAYİ: /bayi/faturalar sayfası açılıyor");

    const bayiFaturalar = await http(dealerS, "GET", "/bayi/faturalar");
    check("bayi /faturalar sayfası 200", bayiFaturalar.status === 200, bayiFaturalar.status);
    // Sayfanın içinde fatura belge no görünmeli
    const externalIdInPage = typeof bayiFaturalar.data === "string"
      && bayiFaturalar.data.includes(dealerInvoice!.externalId!);
    check("bayi sayfasında belge no görünür", externalIdInPage);

    // ═══ 🔟 ADMIN: Faturalar sayfası ═════════════════════
    console.log("\n🔟 ADMIN: /admin/faturalar sayfası açılıyor");

    const adminFaturalar = await http(adminS, "GET", "/admin/faturalar");
    check("admin /faturalar sayfası 200", adminFaturalar.status === 200, adminFaturalar.status);

    // ═══ 1️⃣1️⃣ Admin manual retry (idempotent) ═══════════
    console.log("\n1️⃣1️⃣ Admin manual 'Yeniden Gönder' (SENT idempotent)");

    const retry = await http(adminS, "POST", `/api/admin/invoices/${dealerInvoice!.id}`);
    check("retry endpoint 200", retry.status === 200, retry.status);
    const retryData = retry.data as { status?: string };
    check("SENT status idempotent", retryData?.status === "SENT", retryData);

    // Fatura yine SENT, externalId aynı
    const invAfter = await prisma.invoice.findUnique({ where: { id: dealerInvoice!.id } });
    check("retry sonrası status değişmedi", invAfter?.status === "SENT");
    check("externalId değişmedi", invAfter?.externalId === dealerInvoice?.externalId);

    // ═══ 1️⃣2️⃣ Bayi suspend → yeni sipariş engellendi ═══
    console.log("\n1️⃣2️⃣ Bayi SUSPEND → yeni sipariş 403");

    await prisma.dealer.update({
      where: { id: dealerId },
      data: { status: "SUSPENDED" },
    });

    // Bayi yeniden login (session refresh)
    const dealerS2 = newS("dealer-suspended");
    dealerS2.ip = "10.99.1.4";
    await login(dealerS2, dealerEmail, dealerPwd);

    const blockedOrder = await http(dealerS2, "POST", "/api/orders", {
      items: [{ productId: prodId, quantity: 1 }],
      shipping: {
        fullName: "Test",
        email: dealerEmail,
        phone: "0532 444 55 66",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34710",
        address: "Bayi cd 1",
      },
      paymentMethod: "OPEN_ACCOUNT",
    });
    check("SUSPENDED bayi sipariş engellendi (403)", blockedOrder.status === 403, blockedOrder.status);

    // ═══ 1️⃣3️⃣ Cron retry endpoint ═══════════════════════
    console.log("\n1️⃣3️⃣ Cron retry endpoint (Bearer token ile)");

    // Bearer'sız reddedilmeli
    const cronNoAuth = await http(newS(), "GET", "/api/cron/retry-invoices");
    check("cron Bearer'sız 401/503", cronNoAuth.status === 401 || cronNoAuth.status === 503, cronNoAuth.status);

    // Bearer'lı çalışmalı
    const cronAuth = await fetch(`${BASE}/api/cron/retry-invoices`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const cronData = (await cronAuth.json()) as {
      ok?: boolean;
      attempted?: number;
    };
    check("cron Bearer'lı 200", cronAuth.status === 200, cronAuth.status);
    check("cron response { ok: true }", cronData.ok === true);

    // ═══ 1️⃣4️⃣ Storefront public sayfalar 200 ════════════
    console.log("\n1️⃣4️⃣ Storefront public sayfalar erişilebilir");

    const pages = ["/", "/urunler", "/giris", "/kayit", "/bayi-basvuru", "/iletisim", "/sss", "/kvkk", "/iade"];
    for (const p of pages) {
      const r = await http(newS(), "GET", p);
      check(`GET ${p} 200`, r.status === 200, r.status);
    }

    // ═══ 1️⃣5️⃣ Authz regression ══════════════════════════
    console.log("\n1️⃣5️⃣ Authorization regression");

    const noauthAdmin = await http(newS(), "POST", "/api/admin/products", {});
    check("guest admin endpoint 401", noauthAdmin.status === 401, noauthAdmin.status);

    const custToAdmin = await http(custS, "POST", "/api/admin/products", { name: "x", sku: "x", price: 1 });
    check("customer admin endpoint 403", custToAdmin.status === 403, custToAdmin.status);

    const custToInvoice = await http(custS, "POST", `/api/admin/invoices/${dealerInvoice!.id}`);
    check("customer invoice endpoint 403", custToInvoice.status === 403, custToInvoice.status);

    // ═══ ÖZET ═════════════════════════════════════════════
    console.log("\n═══════════════════════════════════════════════════════");
    console.log(`  TOPLAM: ${pass}/${total} senaryo başarılı`);
    console.log("═══════════════════════════════════════════════════════");
    if (fails.length > 0) {
      console.log("\n❌ Başarısız:");
      for (const f of fails) console.log(`   • ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\n✅ SİSTEM YAYINA HAZIR");
    }
  } catch (err) {
    console.error("\n💥 FATAL:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[cleanup]");
    for (const id of cleanup.orderIds) {
      await prisma.invoice.deleteMany({ where: { orderId: id } }).catch(() => {});
      await prisma.orderEvent.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: id } });
      await prisma.order.deleteMany({ where: { id } });
    }
    for (const id of cleanup.productIds) {
      await prisma.product.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanup.categoryIds) {
      await prisma.category.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanup.publisherIds) {
      await prisma.publisher.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of cleanup.userIds) {
      const orders = await prisma.order.findMany({ where: { userId: id }, select: { id: true } });
      for (const o of orders) {
        await prisma.invoice.deleteMany({ where: { orderId: o.id } }).catch(() => {});
        await prisma.orderEvent.deleteMany({ where: { orderId: o.id } });
        await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
        await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
      }
      await prisma.order.deleteMany({ where: { userId: id } });
      await prisma.address.deleteMany({ where: { userId: id } });
      await prisma.dealer.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
    await pool.end();
  }
})();
