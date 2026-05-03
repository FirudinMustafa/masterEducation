/**
 * Faz 19 — State machine ve karar regression test'leri.
 *
 * 1) Order status machine: PENDING→DELIVERED atlamalı geçiş engelli (400)
 * 2) Order status machine: PENDING→APPROVED→PROCESSING ardışık geçiş kabul
 * 3) Order status machine: DELIVERED→CANCELLED engelli (final state)
 * 4) Doc state machine: APPROVED→REJECTED direkt engelli; PENDING→APPROVED OK
 * 5) 0 TL ürün checkout engeli
 * 6) TR phone validation order shipping'de (zaten unit'te de test ettik)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const cookies = new Map<string, string>();
function applyCookies(h: Headers) {
  for (const sc of h.getSetCookie?.() ?? []) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    cookies.set(k.trim(), v.join("=").trim());
  }
}
const cookieHeader = () =>
  Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

async function login(email: string, password: string) {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  applyCookies(csrf.headers);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: BASE, json: "true" }).toString(),
    redirect: "manual",
  });
  applyCookies(r.headers);
}

(async () => {
  const ts = Date.now();
  let pass = 0, total = 0;
  const fail: string[] = [];
  const check = (n: string, cond: boolean, x?: unknown) => {
    total++;
    if (cond) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else {
      const m = x !== undefined ? ` — ${typeof x === "string" ? x : JSON.stringify(x).slice(0, 200)}` : "";
      console.log(`  ✗ ${n}${m}`);
      fail.push(n);
    }
  };

  const created: { userIds: string[]; orderIds: string[]; productIds: string[]; dealerDocIds: string[] } = {
    userIds: [], orderIds: [], productIds: [], dealerDocIds: [],
  };

  try {
    // Fixtures
    const adminEmail = `faz19-admin-${ts}@test.com`;
    const adminPwd = "AdminPwd123!";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail, name: "F19 Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN", emailVerified: new Date(),
      },
    });
    created.userIds.push(admin.id);

    const customer = await prisma.user.create({
      data: {
        email: `faz19-cust-${ts}@test.com`, name: "F19 Cust",
        passwordHash: await bcrypt.hash("x", 10),
        role: "CUSTOMER", emailVerified: new Date(),
        addresses: {
          create: {
            label: "Ev", fullName: "F19", phone: "05551112233",
            city: "İstanbul", district: "Kadıköy", postalCode: "34710",
            addressLine: "Test cd 5", isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    created.userIds.push(customer.id);
    const custAddr = customer.addresses[0];

    // Test order ürünü
    const product = await prisma.product.findFirst({
      where: { isPublished: true, stockQuantity: { gt: 5 } },
      select: { id: true },
    });
    if (!product) throw new Error("test product yok");

    // Bayi (doc state için)
    const dealer = await prisma.user.create({
      data: {
        email: `faz19-dealer-${ts}@test.com`, name: "F19 Dealer",
        passwordHash: await bcrypt.hash("x", 10),
        role: "DEALER", emailVerified: new Date(),
        dealer: {
          create: {
            companyName: "F19 Co", taxOffice: "Kadıköy", taxNumber: "1234567890",
            status: "PENDING",
          },
        },
      },
      include: { dealer: true },
    });
    created.userIds.push(dealer.id);

    // 0 TL test ürünü oluştur
    const zeroPriceProduct = await prisma.product.create({
      data: {
        name: `F19 0 TL Test ${ts}`,
        slug: `f19-zero-${ts}`,
        sku: `F19-Z-${ts}`,
        nopId: 999000 + (ts % 1000),
        price: 0,
        vatRate: 0,
        stockQuantity: 100,
        isPublished: true,
      },
    });
    created.productIds.push(zeroPriceProduct.id);

    // Admin login
    await login(adminEmail, adminPwd);

    // ─── #1: Order state machine ─────────────────────────────
    console.log("\n#1 Order state machine");

    // Test sipariş oluştur (PENDING)
    const testOrder = await prisma.order.create({
      data: {
        orderNumber: `F19-${ts}`,
        user: { connect: { id: customer.id } },
        status: "PENDING",
        paymentMethod: "CREDIT_CARD",
        paymentStatus: "PENDING",
        subtotal: 100,
        discountTotal: 0,
        shippingCost: 0,
        vatTotal: 0,
        total: 100,
        shippingName: "Test",
        shippingPhone: "5551112233",
        shippingCity: "İstanbul",
        shippingAddress: "Test cd 5",
        address: { connect: { id: custAddr.id } },
      },
    });
    created.orderIds.push(testOrder.id);

    // PENDING → DELIVERED (atlamalı geçiş engelli)
    const r1 = await fetch(`${BASE}/api/admin/orders/${testOrder.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "DELIVERED" }),
    });
    check("PENDING→DELIVERED 400 (atlamalı engelli)", r1.status === 400, r1.status);

    // PENDING → APPROVED OK
    const r2 = await fetch(`${BASE}/api/admin/orders/${testOrder.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    check("PENDING→APPROVED 200 (whitelist)", r2.status === 200, r2.status);

    // APPROVED → SHIPPED engelli (ileri atlamalı)
    const r3 = await fetch(`${BASE}/api/admin/orders/${testOrder.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "SHIPPED" }),
    });
    check("APPROVED→SHIPPED 400 (atlamalı engelli)", r3.status === 400, r3.status);

    // APPROVED → CANCELLED OK
    const r4 = await fetch(`${BASE}/api/admin/orders/${testOrder.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    check("APPROVED→CANCELLED 200 (her aşamadan iptal)", r4.status === 200, r4.status);

    // CANCELLED → diğer engelli (zaten vardı, regress)
    const r5 = await fetch(`${BASE}/api/admin/orders/${testOrder.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "PENDING" }),
    });
    check("CANCELLED final (geri dönüş engelli)", r5.status === 400, r5.status);

    // ─── #2: Doc state machine ─────────────────────────────
    console.log("\n#2 Doc state machine");

    // Bir doc oluştur (PENDING)
    const doc = await prisma.dealerDocument.create({
      data: {
        dealerId: dealer.dealer!.id,
        kind: "TAX_CERTIFICATE",
        filename: `f19-${ts}.pdf`,
        origName: "test.pdf",
        sizeBytes: 1024,
        uploadedBy: dealer.id,
        status: "PENDING",
      },
    });
    created.dealerDocIds.push(doc.id);

    // PENDING → APPROVED OK
    const d1 = await fetch(`${BASE}/api/admin/dealers/${dealer.dealer!.id}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    check("Doc PENDING→APPROVED 200", d1.status === 200, d1.status);

    // APPROVED → REJECTED direkt engelli (önce PENDING)
    const d2 = await fetch(`${BASE}/api/admin/dealers/${dealer.dealer!.id}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "REJECTED", reviewNote: "Sebep var" }),
    });
    check("Doc APPROVED→REJECTED 400 (önce PENDING)", d2.status === 400, d2.status);

    // APPROVED → PENDING OK (yeniden inceleme)
    const d3 = await fetch(`${BASE}/api/admin/dealers/${dealer.dealer!.id}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "PENDING" }),
    });
    check("Doc APPROVED→PENDING 200 (yeniden inceleme)", d3.status === 200, d3.status);

    // PENDING → REJECTED OK (sebep var)
    const d4 = await fetch(`${BASE}/api/admin/dealers/${dealer.dealer!.id}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ status: "REJECTED", reviewNote: "Belge eski tarihli" }),
    });
    check("Doc PENDING→REJECTED 200 (sebep var)", d4.status === 200, d4.status);

    // ─── #5: 0 TL ürün engeli ─────────────────────────────
    console.log("\n#5 0 TL ürün checkout engeli");

    // Customer login
    cookies.clear();
    await login(customer.email, "x");
    const orderRes = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        items: [{ productId: zeroPriceProduct.id, quantity: 1 }],
        shipping: {
          fullName: "Test",
          email: customer.email,
          phone: "0532 111 22 33",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cd 5",
        },
        paymentMethod: "CREDIT_CARD",
        card: {
          number: "4111111111111111",
          expiry: "12/30",
          cvv: "123",
          holderName: "Test",
        },
      }),
    });
    check("0 TL ürün → 400 (fiyat geçersiz)", orderRes.status === 400, orderRes.status);

    // ─── ÖZET ─────────────────────────────
    console.log(`\nÖzet: ${pass}/${total}`);
    if (fail.length > 0) {
      console.log("Fails:", fail);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[cleanup]");
    for (const id of created.dealerDocIds) {
      await prisma.dealerDocument.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of created.orderIds) {
      await prisma.orderEvent.deleteMany({ where: { orderId: id } });
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: id } });
      await prisma.order.deleteMany({ where: { id } });
    }
    for (const id of created.productIds) {
      await prisma.product.deleteMany({ where: { id } }).catch(() => {});
    }
    for (const id of created.userIds) {
      await prisma.address.deleteMany({ where: { userId: id } });
      await prisma.dealerDocument.deleteMany({ where: { dealer: { userId: id } } });
      await prisma.dealer.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
    await pool.end();
  }
})();
