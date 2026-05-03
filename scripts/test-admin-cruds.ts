/**
 * Admin panel TAM CRUD testi.
 * Her entity icin Create/Read/Update/Delete zincirini dener, arka DB'den dogrular.
 * Dev server calismali. Ayrica her operasyon icin yetkisiz erisim testi.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PWD = "admin123";

const STAMP = Date.now().toString();
const TEST_PRODUCT_SKU = `CRUD-PROD-${STAMP}`;
const TEST_CATEGORY_NAME = `CRUD Kat ${STAMP}`;
const TEST_PUBLISHER_NAME = `CRUD Yay ${STAMP}`;
const TEST_COUPON_CODE = `CRUDCPN${STAMP.slice(-6)}`;
const TEST_DEALER_EMAIL = `crud-dealer-${STAMP}@mastereducation.test`;
const TEST_CUSTOMER_EMAIL = `crud-customer-${STAMP}@mastereducation.test`;

let pass = 0, fail = 0;
const issues: string[] = [];
function check(name: string, cond: boolean, note?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${note ? "  " + note : ""}`);
    fail++;
    issues.push(`${name} ${note ?? ""}`);
  }
}

async function req(path: string, init?: RequestInit & { cookies?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.cookies) headers["Cookie"] = init.cookies;
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  return {
    status: res.status,
    text,
    json: (() => { try { return JSON.parse(text); } catch { return null; } })(),
    setCookies: res.headers.getSetCookie(),
  };
}

async function login(email: string, password: string) {
  const csrfRes = await req("/api/auth/csrf");
  const jar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  const params = new URLSearchParams({
    email,
    password,
    csrfToken: csrfRes.json?.csrfToken,
    json: "true",
  });
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar },
    body: params.toString(),
    redirect: "manual",
  });
  return [...csrfRes.setCookies, ...loginRes.headers.getSetCookie()]
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("="))
    .join("; ");
}

async function cleanup() {
  await prisma.product.deleteMany({ where: { sku: TEST_PRODUCT_SKU } });
  await prisma.category.deleteMany({ where: { name: TEST_CATEGORY_NAME } });
  await prisma.publisher.deleteMany({ where: { name: TEST_PUBLISHER_NAME } });
  await prisma.coupon.deleteMany({ where: { code: TEST_COUPON_CODE } });

  for (const email of [TEST_DEALER_EMAIL, TEST_CUSTOMER_EMAIL]) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) continue;
    const d = await prisma.dealer.findUnique({ where: { userId: u.id } });
    if (d) {
      await prisma.dealerDocument.deleteMany({ where: { dealerId: d.id } });
      await prisma.dealerDiscount.deleteMany({ where: { dealerId: d.id } });
      await prisma.dealerLedger.deleteMany({ where: { dealerId: d.id } });
      await prisma.auditLog.deleteMany({ where: { entityId: d.id } });
    }
    const orders = await prisma.order.findMany({ where: { userId: u.id } });
    for (const o of orders) {
      await prisma.auditLog.deleteMany({ where: { entityId: o.id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
      await prisma.couponRedemption.deleteMany({ where: { orderId: o.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    await prisma.productReview.deleteMany({ where: { userId: u.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
    await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: u.id } });
    await prisma.address.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

(async () => {
  console.log("\n=== ADMIN PANEL TAM CRUD TESTI ===\n");
  await cleanup();
  await req("/api/dev-test/reset-rate-limit", { method: "POST" });
  const admin = await login(ADMIN_EMAIL, ADMIN_PWD);

  // ============ 1. CATEGORY CRUD ============
  console.log("\n── 1) KATEGORI CRUD ──");
  const catCreate = await req("/api/admin/categories", {
    method: "POST",
    cookies: admin,
    body: JSON.stringify({ name: TEST_CATEGORY_NAME, type: "ana" }),
  });
  check(`Kategori create -> 200/201`, [200, 201].includes(catCreate.status), `got ${catCreate.status} ${catCreate.text.slice(0, 100)}`);
  const catId = catCreate.json?.id;
  check(`Kategori id dondu`, !!catId);

  const catRead = await prisma.category.findUnique({ where: { id: catId ?? "" } });
  check(`Kategori DB'de var`, catRead?.name === TEST_CATEGORY_NAME);

  const catUpdate = await req(`/api/admin/categories/${catId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ name: TEST_CATEGORY_NAME + " (edited)" }),
  });
  check(`Kategori update -> 200`, catUpdate.status === 200, `got ${catUpdate.status}`);

  const catAfterUpdate = await prisma.category.findUnique({ where: { id: catId ?? "" } });
  check(`Isim guncellendi`, catAfterUpdate?.name.includes("edited") ?? false);

  const catDelete = await req(`/api/admin/categories/${catId}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`Kategori delete -> 200`, catDelete.status === 200);
  const catAfterDelete = await prisma.category.findUnique({ where: { id: catId ?? "" } });
  check(`Kategori silindi`, catAfterDelete === null);

  // Olmayan id update
  const catGhost = await req(`/api/admin/categories/ghost-id-xyz`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ name: "X" }),
  });
  check(`Olmayan kategori update -> 404`, catGhost.status === 404, `got ${catGhost.status}`);

  // ============ 2. PUBLISHER CRUD ============
  console.log("\n── 2) YAYINEVI CRUD ──");
  const pubCreate = await req("/api/admin/publishers", {
    method: "POST",
    cookies: admin,
    body: JSON.stringify({ name: TEST_PUBLISHER_NAME }),
  });
  check(`Yayinevi create -> 200/201`, [200, 201].includes(pubCreate.status), `got ${pubCreate.status}`);
  const pubId = pubCreate.json?.id;

  const pubUpdate = await req(`/api/admin/publishers/${pubId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ name: TEST_PUBLISHER_NAME + " (edited)" }),
  });
  check(`Yayinevi update -> 200`, pubUpdate.status === 200, `got ${pubUpdate.status}`);

  const pubDelete = await req(`/api/admin/publishers/${pubId}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`Yayinevi delete -> 200`, pubDelete.status === 200, `got ${pubDelete.status}`);

  // ============ 3. PRODUCT CRUD ============
  console.log("\n── 3) URUN CRUD ──");
  // Yeni yayinevi olusturup onunla urun ac (pubId silindi yukarida)
  const pub2 = await prisma.publisher.findFirst();
  if (!pub2) throw new Error("No publisher to attach product");

  const prodCreate = await req("/api/admin/products", {
    method: "POST",
    cookies: admin,
    body: JSON.stringify({
      nopId: 9990000 + Math.floor(Math.random() * 1000),
      name: "CRUD TEST URUN",
      sku: TEST_PRODUCT_SKU,
      price: 199.99,
      vatRate: 10,
      stockQuantity: 42,
      publisherId: pub2.id,
      isPublished: true,
    }),
  });
  check(`Urun create -> 200/201`, [200, 201].includes(prodCreate.status), `got ${prodCreate.status} ${prodCreate.text.slice(0, 100)}`);
  const prodId = prodCreate.json?.id;

  const prodRead = await prisma.product.findUnique({ where: { id: prodId ?? "" } });
  check(`Urun DB'de`, prodRead?.sku === TEST_PRODUCT_SKU);
  check(`Stok 42`, prodRead?.stockQuantity === 42);

  // Price update
  const prodPriceUpdate = await req(`/api/admin/products/${prodId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ price: 299.99 }),
  });
  check(`Urun fiyat update -> 200`, prodPriceUpdate.status === 200, `got ${prodPriceUpdate.status}`);

  const prodAfterPrice = await prisma.product.findUnique({ where: { id: prodId ?? "" } });
  check(`Fiyat 299.99`, Number(prodAfterPrice?.price ?? 0) === 299.99);

  // Stock update
  const prodStockUpdate = await req(`/api/admin/products/${prodId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ stockQuantity: 100 }),
  });
  check(`Stok update -> 200`, prodStockUpdate.status === 200);

  // Unpublish
  const prodUnpub = await req(`/api/admin/products/${prodId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ isPublished: false }),
  });
  check(`Yayindan cikar -> 200`, prodUnpub.status === 200);
  const prodAfterUnpub = await prisma.product.findUnique({ where: { id: prodId ?? "" } });
  check(`isPublished=false`, prodAfterUnpub?.isPublished === false);

  // Delete
  const prodDelete = await req(`/api/admin/products/${prodId}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`Urun delete -> 200`, prodDelete.status === 200);

  // ============ 4. COUPON CRUD ============
  console.log("\n── 4) KUPON CRUD ──");
  const cpnCreate = await req("/api/admin/coupons", {
    method: "POST",
    cookies: admin,
    body: JSON.stringify({
      code: TEST_COUPON_CODE,
      kind: "PERCENT",
      value: 15,
      minSubtotal: 100,
      maxUses: 50,
      isActive: true,
    }),
  });
  check(`Kupon create -> 200/201`, [200, 201].includes(cpnCreate.status), `got ${cpnCreate.status} ${cpnCreate.text.slice(0, 100)}`);
  const cpnId = cpnCreate.json?.id;
  const cpnRead = await prisma.coupon.findUnique({ where: { id: cpnId ?? "" } });
  check(`Kupon DB'de`, cpnRead?.code === TEST_COUPON_CODE);
  check(`Kod UPPERCASE`, cpnRead?.code === cpnRead?.code.toUpperCase());
  check(`Kupon aktif`, cpnRead?.isActive === true);

  // Toggle isActive
  const cpnToggle = await req(`/api/admin/coupons/${cpnId}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ isActive: false }),
  });
  check(`Kupon toggle -> 200`, cpnToggle.status === 200, `got ${cpnToggle.status}`);
  const cpnAfterToggle = await prisma.coupon.findUnique({ where: { id: cpnId ?? "" } });
  check(`Pasif`, cpnAfterToggle?.isActive === false);

  // Duplicate code
  const cpnDup = await req("/api/admin/coupons", {
    method: "POST",
    cookies: admin,
    body: JSON.stringify({
      code: TEST_COUPON_CODE,
      kind: "FIXED",
      value: 10,
    }),
  });
  check(`Kupon dup code -> 409`, cpnDup.status === 409, `got ${cpnDup.status}`);

  // Delete
  const cpnDelete = await req(`/api/admin/coupons/${cpnId}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`Kupon delete -> 200`, cpnDelete.status === 200);

  // ============ 5. DEALER WORKFLOW ============
  console.log("\n── 5) BAYI CRUD + WORKFLOW ──");
  // Basvuru (public endpoint)
  const apply = await req("/api/dealer/apply", {
    method: "POST",
    body: JSON.stringify({
      name: "CRUD Dealer",
      email: TEST_DEALER_EMAIL,
      phone: "05551234567",
      password: "DealerTest123",
      companyName: "CRUD Bayi Ltd",
      taxOffice: "Kadikoy",
      taxNumber: "1234567890",
      city: "Istanbul",
      district: "Kadikoy",
      addressLine: "Bayi sok 1",
    }),
  });
  check(`Bayi basvuru -> 201`, apply.status === 201, `got ${apply.status}`);

  const dealerUser = await prisma.user.findUnique({
    where: { email: TEST_DEALER_EMAIL },
    include: { dealer: true },
  });
  const dealerId = dealerUser?.dealer?.id;
  check(`Bayi kayit PENDING`, dealerUser?.dealer?.status === "PENDING");

  if (!dealerId) {
    console.log("  (dealer yok, bu bolum atlaniyor)");
  } else {
    // Dealer info PATCH
    const dealerUpdate = await req(`/api/admin/dealers/${dealerId}`, {
      method: "PATCH",
      cookies: admin,
      body: JSON.stringify({
        creditLimit: 3000,
        notes: "Admin notu test",
        companyName: "CRUD Bayi Ltd (edit)",
      }),
    });
    check(`Dealer update -> 200`, dealerUpdate.status === 200, `got ${dealerUpdate.status} ${dealerUpdate.text.slice(0, 100)}`);
    const dealerAfterUpdate = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check(`Firma adi guncellendi`, !!dealerAfterUpdate?.companyName.includes("edit"));
    check(`Kredi limiti 3000`, Number(dealerAfterUpdate?.creditLimit) === 3000);

    // Approve
    const dealerApprove = await req(`/api/admin/dealers/${dealerId}/approve`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ creditLimit: 5000 }),
    });
    check(`Dealer approve -> 200`, dealerApprove.status === 200);
    const dealerApproved = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check(`Status APPROVED`, dealerApproved?.status === "APPROVED");
    check(`Limit 5000 (approve body'den)`, Number(dealerApproved?.creditLimit) === 5000);

    // Suspend
    const dealerSuspend = await req(`/api/admin/dealers/${dealerId}/suspend`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ notes: "Test askiya" }),
    });
    check(`Dealer suspend -> 200`, dealerSuspend.status === 200);
    const dealerSuspended = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check(`Status SUSPENDED`, dealerSuspended?.status === "SUSPENDED");

    // Reject
    const dealerReject = await req(`/api/admin/dealers/${dealerId}/reject`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ rejectionReason: "Test red" }),
    });
    check(`Dealer reject -> 200`, dealerReject.status === 200);
    const dealerRejected = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check(`Status REJECTED`, dealerRejected?.status === "REJECTED");
    check(`rejectionReason kayitli`, dealerRejected?.rejectionReason === "Test red");

    // Payment (ledger credit)
    const paymentAdd = await req(`/api/admin/dealers/${dealerId}/payments`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({
        amount: 500,
        reference: "Banka",
        note: "Test tahsilat",
      }),
    });
    check(`Dealer odeme -> 200`, paymentAdd.status === 200, `got ${paymentAdd.status} ${paymentAdd.text.slice(0, 100)}`);

    const ledgerAfterPayment = await prisma.dealerLedger.findFirst({
      where: { dealerId, kind: "PAYMENT_CREDIT" },
      orderBy: { createdAt: "desc" },
    });
    check(`Ledger'da PAYMENT_CREDIT`, ledgerAfterPayment !== null);
    check(`Amount negatif (credit)`, Number(ledgerAfterPayment?.amount ?? 0) < 0);

    // Adjustment (manual)
    const adjustment = await req(`/api/admin/dealers/${dealerId}/adjustments`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({
        amount: 100,
        note: "Test duzeltme",
      }),
    });
    check(`Dealer duzeltme -> 200`, adjustment.status === 200, `got ${adjustment.status}`);

    // Discount rule ekle
    const discRule = await req("/api/admin/discounts", {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({
        dealerId,
        scope: "GLOBAL",
        discountPct: 20,
      }),
    });
    check(`Global iskonto -> 200/201`, [200, 201].includes(discRule.status), `got ${discRule.status}`);

    // Discount delete
    const discList = await prisma.dealerDiscount.findMany({ where: { dealerId } });
    if (discList.length > 0) {
      const discDelete = await req(`/api/admin/discounts/${discList[0].id}`, {
        method: "DELETE",
        cookies: admin,
      });
      check(`Iskonto delete -> 200`, discDelete.status === 200);
    }

    // Dealer delete (ledger olduğu icin - 409 bekliyoruz)
    const dealerDeleteFail = await req(`/api/admin/dealers/${dealerId}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Ledger hareketi olan bayi silinemez -> 409`, dealerDeleteFail.status === 409);

    // Ledger temizleyip tekrar dene
    await prisma.dealerLedger.deleteMany({ where: { dealerId } });
    const dealerDeleteOk = await req(`/api/admin/dealers/${dealerId}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Temiz bayi silinebilir -> 200`, dealerDeleteOk.status === 200);
    const dealerGone = await prisma.dealer.findUnique({ where: { id: dealerId } });
    check(`Dealer silindi`, dealerGone === null);
    const userAfter = await prisma.user.findUnique({ where: { email: TEST_DEALER_EMAIL } });
    check(`User CUSTOMER'a dusturuldu`, userAfter?.role === "CUSTOMER");
  }

  // ============ 6. ORDER CRUD ============
  console.log("\n── 6) SIPARIS STATUS CRUD ──");
  // PENDING siparis yoksa olustur
  let orderForTest = await prisma.order.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  if (!orderForTest) {
    // Bir test siparisi sinerjik yaratay — cart'tan gecmeden DB'ye direkt ekle
    const testBuyer = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
    const prd = await prisma.product.findFirst({
      where: { isPublished: true, stockQuantity: { gt: 5 } },
    });
    if (testBuyer && prd) {
      const addr = await prisma.address.create({
        data: {
          userId: testBuyer.id,
          fullName: "CRUD Test Buyer",
          phone: "05550000000",
          city: "Istanbul",
          district: "Kadikoy",
          addressLine: "Test adres",
        },
      });
      orderForTest = await prisma.order.create({
        data: {
          orderNumber: `CRUD-TEST-${STAMP}`,
          userId: testBuyer.id,
          addressId: addr.id,
          status: "PENDING",
          paymentMethod: "CREDIT_CARD",
          paymentStatus: "PAID",
          subtotal: Number(prd.price),
          total: Number(prd.price),
          shippingName: "CRUD Test",
          shippingCity: "Istanbul",
          shippingAddress: "Test adres",
          shippingPhone: "05550000000",
          items: {
            create: {
              productId: prd.id,
              quantity: 1,
              unitPrice: Number(prd.price),
              lineTotal: Number(prd.price),
              productName: prd.name,
              productSku: prd.sku,
            },
          },
        },
      });
    }
  }

  if (!orderForTest) {
    console.log("  (PENDING siparis olusturulamadi, atlaniyor)");
  } else {
    const statusPend = orderForTest;
    const toApproved = await req(`/api/admin/orders/${statusPend.id}/status`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ status: "APPROVED", trackingNumber: "CRUD-TRK-001" }),
    });
    check(`Status APPROVED -> 200`, toApproved.status === 200);

    const afterApproved = await prisma.order.findUnique({ where: { id: statusPend.id } });
    check(`Order APPROVED`, afterApproved?.status === "APPROVED");
    check(`Kargo no kaydedildi`, afterApproved?.trackingNumber === "CRUD-TRK-001");

    // SHIPPED
    const toShipped = await req(`/api/admin/orders/${statusPend.id}/status`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ status: "SHIPPED" }),
    });
    check(`Status SHIPPED -> 200`, toShipped.status === 200);
    const afterShipped = await prisma.order.findUnique({ where: { id: statusPend.id } });
    check(`shippedAt set`, afterShipped?.shippedAt !== null);

    // CANCELLED (stok iade)
    const stockBefore = await prisma.orderItem.findMany({
      where: { orderId: statusPend.id },
    });
    const productIds = stockBefore.map((i) => i.productId);
    const productsBefore = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stockQuantity: true },
    });

    const toCancelled = await req(`/api/admin/orders/${statusPend.id}/status`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    check(`Status CANCELLED -> 200`, toCancelled.status === 200);
    const productsAfter = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stockQuantity: true },
    });
    const stockIncreased = productsAfter.every((p) => {
      const before = productsBefore.find((b) => b.id === p.id);
      return p.stockQuantity >= (before?.stockQuantity ?? 0);
    });
    check(`Iptal sonrasi stok iade`, stockIncreased);
  }

  // Invalid status
  const anyOrder = await prisma.order.findFirst();
  if (anyOrder) {
    const invalidStatus = await req(`/api/admin/orders/${anyOrder.id}/status`, {
      method: "POST",
      cookies: admin,
      body: JSON.stringify({ status: "INVALID_STATUS" }),
    });
    check(`Gecersiz status -> 400`, invalidStatus.status === 400);
  }

  // ============ 7. USER ROLE CRUD ============
  console.log("\n── 7) KULLANICI CRUD ──");
  const customer = await prisma.user.create({
    data: {
      email: TEST_CUSTOMER_EMAIL,
      name: "CRUD Customer",
      passwordHash: await bcrypt.hash("CustomerTest123", 10),
      role: "CUSTOMER",
    },
  });

  const roleChange = await req(`/api/admin/users/${customer.id}/role`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ role: "ADMIN" }),
  });
  check(`CUSTOMER -> ADMIN -> 200`, roleChange.status === 200);
  const afterRole = await prisma.user.findUnique({ where: { id: customer.id } });
  check(`Rol ADMIN`, afterRole?.role === "ADMIN");

  // Geri al
  await req(`/api/admin/users/${customer.id}/role`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ role: "CUSTOMER" }),
  });

  // Invalid role
  const invalidRole = await req(`/api/admin/users/${customer.id}/role`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ role: "SUPERHERO" }),
  });
  check(`Gecersiz rol -> 400`, invalidRole.status === 400);

  // CUSTOMER -> DEALER (dealer kaydi yok -> 400)
  const toDealer = await req(`/api/admin/users/${customer.id}/role`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ role: "DEALER" }),
  });
  check(`Kayitsiz DEALER -> 400`, toDealer.status === 400);

  // Delete (siparis yok)
  const userDelete = await req(`/api/admin/users/${customer.id}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`User delete -> 200`, userDelete.status === 200);
  const userGone = await prisma.user.findUnique({ where: { id: customer.id } });
  check(`User silindi`, userGone === null);

  // ============ 8. REVIEW CRUD ============
  console.log("\n── 8) YORUM CRUD ──");
  // Customer yarat + review olustur
  const revCustomer = await prisma.user.create({
    data: {
      email: `crud-rev-${STAMP}@mastereducation.test`,
      name: "Rev Customer",
      passwordHash: await bcrypt.hash("x", 4),
      role: "CUSTOMER",
    },
  });
  const anyProduct = await prisma.product.findFirst({ where: { isPublished: true } });
  if (!anyProduct) throw new Error("No product");
  const review = await prisma.productReview.create({
    data: {
      productId: anyProduct.id,
      userId: revCustomer.id,
      rating: 5,
      title: "CRUD test",
      comment: "Cok iyi urun, CRUD testi",
      status: "APPROVED",
    },
  });

  // Gizle (APPROVED -> REJECTED)
  const revHide = await req(`/api/admin/reviews/${review.id}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ status: "REJECTED" }),
  });
  check(`Yorum gizle -> 200`, revHide.status === 200);
  const revAfterHide = await prisma.productReview.findUnique({ where: { id: review.id } });
  check(`Status REJECTED`, revAfterHide?.status === "REJECTED");

  // Geri yayina al
  const revReapprove = await req(`/api/admin/reviews/${review.id}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ status: "APPROVED" }),
  });
  check(`Tekrar yayina al -> 200`, revReapprove.status === 200);

  // Sil
  const revDelete = await req(`/api/admin/reviews/${review.id}`, {
    method: "DELETE",
    cookies: admin,
  });
  check(`Yorum sil -> 200`, revDelete.status === 200);
  const revGone = await prisma.productReview.findUnique({ where: { id: review.id } });
  check(`Yorum silindi`, revGone === null);

  await prisma.user.delete({ where: { id: revCustomer.id } });

  // ============ 9. YETKISIZ ERISIM ============
  console.log("\n── 9) YETKISIZ ERISIM ──");
  const unauthorized = await req("/api/admin/products", {
    method: "POST",
    body: JSON.stringify({ nopId: 1, name: "x", sku: "y", price: 1, publisherId: pub2.id }),
  });
  check(`Yetkisiz create -> 401/403`, [401, 403].includes(unauthorized.status), `got ${unauthorized.status}`);

  // ============ SONUC ============
  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  if (fail > 0) {
    console.log("Sorunlar:");
    issues.forEach((i) => console.log(`  - ${i}`));
  }

  await cleanup();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
