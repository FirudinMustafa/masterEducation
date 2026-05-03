/**
 * Faz 20.B — KolayBi senaryoları (mock mode end-to-end).
 *
 * Mock mode (`KOLAYBI_MOCK=true`) ile gerçek HTTP atmadan tam akışı test eder.
 * Credentials gelene kadar regression coverage burada.
 *
 * Senaryolar:
 *   1. Bayi siparişi DELIVERED → Invoice PENDING → SENT (mock)
 *   2. Customer siparişi DELIVERED → Invoice CANCELLED (T.C. kimlik yok)
 *   3. Cache: aynı bayi 2. fatura → ensureContact 1 kere POST (cache hit)
 *   4. Cache: aynı ürün 2. fatura → ensureProduct 1 kere POST
 *   5. Manual retry endpoint: admin "yeniden gönder"
 *   6. Cron retry: PENDING+FAILED batch
 *   7. Idempotency: aynı sipariş 2 kere SENT olmaz
 *   8. Adapter mock state: doğru sayıda POST atıldı (assert)
 *   9. Authz: customer admin invoice endpoint'ine erişemez
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

// MOCK mode'a zorla
process.env.KOLAYBI_MOCK = "true";

import * as kolaybi from "@/lib/adapters/kolaybi";
import {
  ensureInvoiceForOrder,
  sendPendingInvoice,
  retryFailedInvoices,
} from "@/lib/invoice-service";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
const cleanup: { userIds: string[]; orderIds: string[]; productIds: string[] } = {
  userIds: [],
  orderIds: [],
  productIds: [],
};

(async () => {
  try {
    console.log("─── KolayBi senaryo testleri (mock mode) ───");
    console.log(`  isMockMode=${kolaybi.isMockMode()} isOperational=${kolaybi.isOperational()}\n`);
    kolaybi._resetMockState();

    // ─── Fixtures ───────────────────────────────────────
    const dealerEmail = `kbis-dealer-${ts}@test.com`;
    const dealerUser = await prisma.user.create({
      data: {
        email: dealerEmail,
        name: "KBIS Bayi Sahibi",
        passwordHash: await bcrypt.hash("x", 10),
        role: "DEALER",
        emailVerified: new Date(),
        phone: "5551112233",
        dealer: {
          create: {
            companyName: "KBIS Test Bayi A.Ş.",
            taxOffice: "Kadıköy",
            taxNumber: "1234567890",
            status: "APPROVED",
            paymentTerms: "OPEN_ACCOUNT",
            creditLimit: 10000,
          },
        },
        addresses: {
          create: {
            label: "Fatura",
            fullName: "KBIS Bayi",
            phone: "5551112233",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test cd 5",
            isDefault: true,
          },
        },
      },
      include: { dealer: true, addresses: true },
    });
    cleanup.userIds.push(dealerUser.id);

    const custEmail = `kbis-cust-${ts}@test.com`;
    const customer = await prisma.user.create({
      data: {
        email: custEmail,
        name: "KBIS Customer",
        passwordHash: await bcrypt.hash("x", 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "Ev",
            fullName: "KBIS Cust",
            phone: "5552223344",
            city: "Ankara",
            district: "Çankaya",
            postalCode: "06800",
            addressLine: "Test cd 7",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    cleanup.userIds.push(customer.id);

    // İki test ürünü
    const p1 = await prisma.product.create({
      data: {
        name: `KBIS Ürün A ${ts}`,
        slug: `kbis-a-${ts}`,
        sku: `KBIS-A-${ts}`,
        nopId: 990000 + (ts % 1000),
        price: 100,
        vatRate: 10,
        stockQuantity: 100,
        isPublished: true,
      },
    });
    const p2 = await prisma.product.create({
      data: {
        name: `KBIS Ürün B ${ts}`,
        slug: `kbis-b-${ts}`,
        sku: `KBIS-B-${ts}`,
        nopId: 990500 + (ts % 1000),
        price: 200,
        vatRate: 10,
        stockQuantity: 100,
        isPublished: true,
      },
    });
    cleanup.productIds.push(p1.id, p2.id);

    async function makeOrder(userId: string, addressId: string, status: "PENDING" | "DELIVERED", suffix: string) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `KBIS-${ts}-${suffix}`,
          user: { connect: { id: userId } },
          address: { connect: { id: addressId } },
          status,
          paymentMethod: "OPEN_ACCOUNT",
          paymentStatus: "PAID",
          subtotal: 300,
          discountTotal: 0,
          shippingCost: 0,
          vatTotal: 0,
          total: 300,
          shippingName: "Test",
          shippingPhone: "5551112233",
          shippingCity: "İstanbul",
          shippingAddress: "Test cd 5",
          items: {
            create: [
              {
                productId: p1.id,
                productName: p1.name,
                productSku: p1.sku,
                quantity: 1,
                unitPrice: 100,
                discountPct: 0,
                vatRate: 10,
                vatAmount: 9.09,
                lineTotal: 100,
              },
              {
                productId: p2.id,
                productName: p2.name,
                productSku: p2.sku,
                quantity: 1,
                unitPrice: 200,
                discountPct: 0,
                vatRate: 10,
                vatAmount: 18.18,
                lineTotal: 200,
              },
            ],
          },
        },
      });
      cleanup.orderIds.push(order.id);
      return order;
    }

    // ─── #1: Bayi DELIVERED → SENT ──────────────────────
    console.log("#1 Bayi DELIVERED → Invoice → SENT");
    const order1 = await makeOrder(dealerUser.id, dealerUser.addresses[0].id, "DELIVERED", "1");
    const r1 = await ensureInvoiceForOrder(order1.id);
    check("ensureInvoice created (bayi)", r1.created && Boolean(r1.invoiceId));

    const send1 = await sendPendingInvoice(r1.invoiceId);
    check("sendPendingInvoice → SENT", send1.status === "SENT", send1);

    const inv1 = await prisma.invoice.findUnique({ where: { id: r1.invoiceId } });
    check("DB invoice.status = SENT", inv1?.status === "SENT");
    check("DB invoice.externalId set", Boolean(inv1?.externalId));
    check("DB invoice.syncedAt set", Boolean(inv1?.syncedAt));

    // Mock cache cache cache: contact ve product POST'ları geldi mi?
    const calls1 = kolaybi._getMockCalls();
    const contactCalls = calls1.filter((c) => c.path === "/kolaybi/v1/associates");
    const productCalls = calls1.filter((c) => c.path === "/kolaybi/v1/products");
    const invoiceCalls = calls1.filter((c) => c.path === "/kolaybi/v1/invoices");
    check("KolayBi POST /associates: 1 kere", contactCalls.length === 1, `${contactCalls.length}`);
    check("KolayBi POST /products: 2 kere (her ürün için)", productCalls.length === 2, `${productCalls.length}`);
    check("KolayBi POST /invoices: 1 kere", invoiceCalls.length === 1);

    // Dealer'a kolaybiContactId cache'lendi mi?
    const dealerAfter = await prisma.dealer.findUnique({ where: { id: dealerUser.dealer!.id } });
    check("dealer.kolaybiContactId cache'lendi", typeof dealerAfter?.kolaybiContactId === "number");
    check("dealer.kolaybiAddressId cache'lendi", typeof dealerAfter?.kolaybiAddressId === "number");

    const p1After = await prisma.product.findUnique({ where: { id: p1.id } });
    check("product.kolaybiProductId cache'lendi", typeof p1After?.kolaybiProductId === "number");

    // ─── #2: Customer DELIVERED → CANCELLED ─────────────
    console.log("\n#2 Customer DELIVERED → Invoice CANCELLED (TC kimlik yok)");
    const order2 = await makeOrder(customer.id, customer.addresses[0].id, "DELIVERED", "2");
    const r2 = await ensureInvoiceForOrder(order2.id);
    check(
      "ensureInvoice customer için skip (CUSTOMER_ORDER)",
      !r2.created && r2.skippedReason === "CUSTOMER_ORDER",
      r2,
    );

    // Hiç invoice oluşturulmadığı için DB'de yok
    const noInv = await prisma.invoice.findUnique({ where: { orderId: order2.id } });
    check("DB'de customer order için invoice yok", noInv === null);

    // ─── #3: Cache hit — aynı bayi 2. fatura ─────────────
    console.log("\n#3 Cache hit: 2. fatura → 1 contact POST atılır");
    kolaybi._resetMockState();
    const order3 = await makeOrder(dealerUser.id, dealerUser.addresses[0].id, "DELIVERED", "3");
    const r3 = await ensureInvoiceForOrder(order3.id);
    await sendPendingInvoice(r3.invoiceId);

    const calls3 = kolaybi._getMockCalls();
    const newContacts = calls3.filter((c) => c.path === "/kolaybi/v1/associates");
    const newProducts = calls3.filter((c) => c.path === "/kolaybi/v1/products");
    check("Aynı bayi → 0 yeni contact POST (cache hit)", newContacts.length === 0, `${newContacts.length}`);
    check("Aynı ürünler → 0 yeni product POST (cache hit)", newProducts.length === 0, `${newProducts.length}`);

    // ─── #4: Manual retry endpoint ───────────────────────
    console.log("\n#4 Admin manual retry endpoint (HTTP)");
    // Admin oluştur
    const adminEmail = `kbis-admin-${ts}@test.com`;
    const adminPwd = "AdminPwd123!";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "KBIS Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    cleanup.userIds.push(admin.id);

    // Admin login
    const cookies = new Map<string, string>();
    const csrf = await fetch(`${BASE}/api/auth/csrf`);
    for (const sc of csrf.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const [k, ...v] = pair.split("=");
      cookies.set(k.trim(), v.join("=").trim());
    }
    const csrfToken = ((await csrf.json()) as { csrfToken: string }).csrfToken;
    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: new URLSearchParams({
        email: adminEmail,
        password: adminPwd,
        csrfToken,
        callbackUrl: BASE,
        json: "true",
      }).toString(),
      redirect: "manual",
    });
    for (const sc of loginRes.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const [k, ...v] = pair.split("=");
      cookies.set(k.trim(), v.join("=").trim());
    }
    const cookieHeader = Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

    // r1 invoice'ı zaten SENT — retry no-op
    const retryR1 = await fetch(`${BASE}/api/admin/invoices/${r1.invoiceId}`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    const retryR1Data = (await retryR1.json()) as { status: string };
    check(
      "POST /api/admin/invoices/[id] SENT'i tekrarlamaz",
      retryR1.status === 200 && retryR1Data.status === "SENT",
      retryR1Data,
    );

    // Customer oluştur ve customer cookies ile authz reddi
    const custCookies = new Map<string, string>();
    // Customer için ayrı session kur
    const csrf2 = await fetch(`${BASE}/api/auth/csrf`);
    for (const sc of csrf2.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const [k, ...v] = pair.split("=");
      custCookies.set(k.trim(), v.join("=").trim());
    }

    // Customer'a şifre ata
    await prisma.user.update({
      where: { id: customer.id },
      data: { passwordHash: await bcrypt.hash("CustPwd123!", 10) },
    });
    const csrfToken2 = ((await csrf2.json()) as { csrfToken: string }).csrfToken;
    const loginRes2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: Array.from(custCookies.entries()).map(([k, v]) => `${k}=${v}`).join("; "),
      },
      body: new URLSearchParams({
        email: custEmail,
        password: "CustPwd123!",
        csrfToken: csrfToken2,
        callbackUrl: BASE,
        json: "true",
      }).toString(),
      redirect: "manual",
    });
    for (const sc of loginRes2.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const [k, ...v] = pair.split("=");
      custCookies.set(k.trim(), v.join("=").trim());
    }
    const custCookieHeader = Array.from(custCookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

    const custTry = await fetch(`${BASE}/api/admin/invoices/${r1.invoiceId}`, {
      method: "POST",
      headers: { cookie: custCookieHeader },
    });
    check(
      "Customer admin/invoices endpoint'ine erişemez (403)",
      custTry.status === 403,
      custTry.status,
    );

    // ─── #5: Cron retry batch ────────────────────────────
    console.log("\n#5 Cron retry batch");
    // FAILED bir invoice oluştur (hardcoded — gerçek API ile zor)
    await prisma.invoice.update({
      where: { id: r1.invoiceId },
      data: { status: "FAILED", attemptCount: 2, errorMessage: "test error" },
    });
    const retry = await retryFailedInvoices();
    check("retryFailedInvoices > 0 attempted", retry.attempted >= 1, retry);
    check("retry sonrası invoice tekrar SENT", retry.succeeded >= 1, retry);

    // ─── #6: Idempotency — aynı orderId 2 kez ensure ─────
    console.log("\n#6 Idempotency");
    const r1Again = await ensureInvoiceForOrder(order1.id);
    check(
      "ensureInvoice idempotent (aynı invoiceId döner)",
      !r1Again.created && r1Again.invoiceId === r1.invoiceId,
    );

    // ─── ÖZET ────────────────────────────────────────────
    console.log(`\nÖzet: ${pass}/${total}`);
    if (fails.length > 0) {
      console.log("Fails:", fails);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("FATAL:", err);
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
    for (const id of cleanup.userIds) {
      await prisma.address.deleteMany({ where: { userId: id } });
      await prisma.dealer.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
    await pool.end();
  }
})();
