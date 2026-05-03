/**
 * ADMIN SENARYOLARI — admin panel operasyonlari end-to-end.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PWD = "admin123";

const TEST_SKU_PREFIX = "ADMIN-SCENARIO-";
const TEST_NOP_START = 999900;

let pass = 0, fail = 0;
const issues: string[] = [];
function check(name: string, cond: boolean, note?: string) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${note ? "  " + note : ""}`); fail++; issues.push(`ADMIN: ${name} ${note ?? ""}`); }
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
  const csrfToken = csrfRes.json?.csrfToken;
  const jar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  const params = new URLSearchParams({ email, password, csrfToken, json: "true" });
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
  await prisma.product.deleteMany({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
  });
}

(async () => {
  console.log("\n=== ADMIN SCENARIOS ===\n");
  await cleanup();
  await req("/api/dev-test/reset-rate-limit", { method: "POST" });

  // ========= A) LOGIN & ACCESS =========
  console.log("\n── A) Admin login + erisim ──");
  const noAuthAdmin = await req("/admin");
  check(`Yetkisiz /admin -> redirect`, [302, 303, 307, 308].includes(noAuthAdmin.status), `got ${noAuthAdmin.status}`);

  // Admin API yetkisiz
  const unAuthApi = await req("/api/admin/products/template");
  check(`Yetkisiz /api/admin/* -> 401/403`, [401, 403].includes(unAuthApi.status));

  const adminCookies = await login(ADMIN_EMAIL, ADMIN_PWD);
  check(`Admin login`, adminCookies.length > 0);

  // ========= B) ADMIN PANEL SAYFALARI =========
  console.log("\n── B) Admin paneli sayfalari ──");
  for (const [label, path] of [
    ["dashboard", "/admin"],
    ["urunler", "/admin/urunler"],
    ["yeni urun", "/admin/urunler/yeni"],
    ["toplu yukleme", "/admin/urunler/toplu-yukleme"],
    ["siparisler", "/admin/siparisler"],
    ["bayiler", "/admin/bayiler"],
    ["iskontolar", "/admin/iskontolar"],
    ["kuponlar", "/admin/kuponlar"],
    ["yorumlar", "/admin/yorumlar"],
    ["kategoriler", "/admin/kategoriler"],
    ["yayinevleri", "/admin/yayinevleri"],
    ["kullanicilar", "/admin/kullanicilar"],
    ["muhasebe", "/admin/muhasebe"],
    ["analytics", "/admin/analytics"],
    ["email-log", "/admin/email-log"],
    ["error-log", "/admin/error-log"],
  ] as const) {
    const r = await req(path, { cookies: adminCookies });
    check(`/admin/${label === "dashboard" ? "" : label} -> 200`, r.status === 200, `got ${r.status}`);
  }

  // ========= C) URUN CRUD =========
  console.log("\n── C) Urun CRUD ──");
  const pubOne = await prisma.publisher.findFirst();
  if (!pubOne) throw new Error("No publisher");

  // Yeni urun olustur
  const newProd = await req("/api/admin/products", {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({
      nopId: TEST_NOP_START,
      name: "ADMIN TEST URUN",
      sku: TEST_SKU_PREFIX + "1",
      price: 99.99,
      vatRate: 0,
      stockQuantity: 50,
      publisherId: pubOne.id,
      isPublished: true,
    }),
  });
  check(`Yeni urun -> 201/200`, [200, 201].includes(newProd.status), `got ${newProd.status} ${newProd.text.slice(0, 150)}`);
  const createdProdId = newProd.json?.id;

  if (createdProdId) {
    // Guncelle
    const update = await req(`/api/admin/products/${createdProdId}`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ stockQuantity: 75 }),
    });
    check(`Urun update -> 200`, update.status === 200, `got ${update.status}`);

    const updated = await prisma.product.findUnique({ where: { id: createdProdId } });
    check(`Stok guncellendi`, updated?.stockQuantity === 75);

    // Sil
    const del = await req(`/api/admin/products/${createdProdId}`, {
      method: "DELETE",
      cookies: adminCookies,
    });
    check(`Urun delete -> 200`, del.status === 200, `got ${del.status}`);
  }

  // ========= D) BULK IMPORT TEMPLATE =========
  console.log("\n── D) Bulk import ──");
  const tpl = await req("/api/admin/products/template", { cookies: adminCookies });
  check(`Template -> 200`, tpl.status === 200);
  check(`Template binary`, tpl.text.length > 5000);

  // ========= E) SIPARIS YONETIMI =========
  console.log("\n── E) Siparis yonetimi ──");
  // PENDING bir siparis bul veya olustur
  const anyOrder = await prisma.order.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (anyOrder) {
    const statusUpdate = await req(`/api/admin/orders/${anyOrder.id}/status`, {
      method: "POST",
      cookies: adminCookies,
      body: JSON.stringify({
        status: "APPROVED",
        trackingNumber: "TEST-TRK-001",
      }),
    });
    check(`Siparis status APPROVED -> 200`, statusUpdate.status === 200, `got ${statusUpdate.status} ${statusUpdate.text.slice(0, 150)}`);

    // Iptal + stok iade
    const cancel = await req(`/api/admin/orders/${anyOrder.id}/status`, {
      method: "POST",
      cookies: adminCookies,
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    check(`Siparis CANCELLED -> 200`, cancel.status === 200, `got ${cancel.status}`);
  } else {
    console.log("  (PENDING siparis yok, skip)");
  }

  // ========= F) KUPON CRUD =========
  console.log("\n── F) Kupon yonetimi ──");
  const newCoupon = await req("/api/admin/coupons", {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({
      code: "ADMINTEST" + Date.now(),
      kind: "PERCENT",
      value: 10,
      minSubtotal: 0,
      maxUses: 100,
    }),
  });
  check(`Kupon olustur -> 200/201`, [200, 201].includes(newCoupon.status), `got ${newCoupon.status} ${newCoupon.text.slice(0, 150)}`);

  const couponId = newCoupon.json?.id;
  if (couponId) {
    // Kupon sil
    const delCoupon = await req(`/api/admin/coupons/${couponId}`, {
      method: "DELETE",
      cookies: adminCookies,
    });
    check(`Kupon delete -> 200`, delCoupon.status === 200, `got ${delCoupon.status}`);
  }

  // ========= G) KATEGORI / YAYINEVI =========
  console.log("\n── G) Kategori & yayinevi CRUD ──");
  const newCat = await req("/api/admin/categories", {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({ name: "Admin Test Kat " + Date.now() }),
  });
  check(`Kategori olustur -> 200/201`, [200, 201].includes(newCat.status), `got ${newCat.status}`);
  if (newCat.json?.id) {
    const delCat = await req(`/api/admin/categories/${newCat.json.id}`, {
      method: "DELETE",
      cookies: adminCookies,
    });
    check(`Kategori delete -> 200`, delCat.status === 200);
  }

  const newPub = await req("/api/admin/publishers", {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({ name: "Admin Test Yay " + Date.now() }),
  });
  check(`Yayinevi olustur -> 200/201`, [200, 201].includes(newPub.status), `got ${newPub.status}`);
  if (newPub.json?.id) {
    const delPub = await req(`/api/admin/publishers/${newPub.json.id}`, {
      method: "DELETE",
      cookies: adminCookies,
    });
    check(`Yayinevi delete -> 200`, delPub.status === 200);
  }

  // ========= H) MUHASEBE EXPORT =========
  console.log("\n── H) Muhasebe export ──");
  const expXlsx = await req("/api/admin/accounting/export?type=orders&format=xlsx", { cookies: adminCookies });
  check(`Muhasebe XLSX -> 200`, expXlsx.status === 200);
  check(`Muhasebe XLSX binary`, expXlsx.text.length > 5000);

  const expCsv = await req("/api/admin/accounting/export?type=orders&format=csv", { cookies: adminCookies });
  check(`Muhasebe CSV -> 200`, expCsv.status === 200);

  const expItems = await req("/api/admin/accounting/export?type=items&format=xlsx", { cookies: adminCookies });
  check(`Muhasebe items XLSX -> 200`, expItems.status === 200);

  // ========= I) YORUM MODERASYON =========
  console.log("\n── I) Yorum moderasyon (endpoint check) ──");
  // PENDING yorum var mi?
  const pending = await prisma.productReview.findFirst({ where: { status: "PENDING" } });
  if (pending) {
    const modApprove = await req(`/api/admin/reviews/${pending.id}`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ status: "APPROVED" }),
    });
    check(`Yorum APPROVED -> 200`, modApprove.status === 200, `got ${modApprove.status}`);
  } else {
    console.log("  (PENDING yorum yok, skip)");
  }

  // ========= J) KULLANICI ROL DEGISTIRME =========
  console.log("\n── J) Kullanici rol degistirme ──");
  const someCustomer = await prisma.user.findFirst({
    where: { role: "CUSTOMER", email: { not: ADMIN_EMAIL } },
  });
  if (someCustomer) {
    // Kendi rolunu degistiremez
    const selfRole = await req(`/api/admin/users/${(await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))!.id}/role`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ role: "CUSTOMER" }),
    });
    check(`Kendi rolunu degistiremez -> 400`, selfRole.status === 400, `got ${selfRole.status}`);

    // Customer'i admin yap
    const roleChg = await req(`/api/admin/users/${someCustomer.id}/role`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ role: "ADMIN" }),
    });
    check(`CUSTOMER -> ADMIN`, roleChg.status === 200, `got ${roleChg.status}`);

    // Geri al
    await req(`/api/admin/users/${someCustomer.id}/role`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ role: "CUSTOMER" }),
    });
  }

  // ========= K) ERROR CASES =========
  console.log("\n── K) Hata durumlari ──");
  // Gecersiz JSON POST
  const badJson = await fetch(BASE + "/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: "not json",
  });
  check(`Bozuk JSON -> 400`, badJson.status === 400, `got ${badJson.status}`);

  // Olmayan urun update
  const ghostUpdate = await req(`/api/admin/products/non-existent-id-xyz`, {
    method: "PATCH",
    cookies: adminCookies,
    body: JSON.stringify({ stockQuantity: 100 }),
  });
  check(`Olmayan urun update -> 404`, ghostUpdate.status === 404, `got ${ghostUpdate.status}`);

  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  if (fail > 0) {
    console.log("Sorunlar:");
    issues.forEach((i) => console.log(`  - ${i}`));
  }
  await cleanup();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
