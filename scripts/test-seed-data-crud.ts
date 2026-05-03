/**
 * SEED verileri (mevcut urun/kategori/yayinevi) uzerinde CRUD denemesi.
 * Admin panelde kullanicinin deneyebilecegi senaryoyu dogrular:
 *  - Seed urunu guncelleyebilir mi
 *  - Seed urunu silebilir mi (siparisi yoksa hard, varsa soft)
 *  - Seed kategoriyi silmeye calissa ne olur (uzerinde urun var -> 409 sonra force)
 *  - Seed yayinevini silmeye calissa ayni
 * Cleanup icin tum islemleri transaction-benzeri geri aliyoruz.
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

let pass = 0, fail = 0;
function check(name: string, cond: boolean, note?: string) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${note ? "  " + note : ""}`); fail++; }
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

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const jar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  const params = new URLSearchParams({
    email: ADMIN_EMAIL,
    password: ADMIN_PWD,
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

(async () => {
  console.log("\n=== SEED VERI CRUD TESTI ===\n");
  await req("/api/dev-test/reset-rate-limit", { method: "POST" });
  const admin = await login();

  // ── 1) Seed urun guncelleme ──
  console.log("\n── 1) Seed urun guncelleme ──");
  const sampleProduct = await prisma.product.findFirst({
    where: { isPublished: true, sku: { startsWith: "9" } }, // real seed SKU
  });
  if (!sampleProduct) throw new Error("Seed urunu bulunamadi");

  const originalPrice = Number(sampleProduct.price);
  const update = await req(`/api/admin/products/${sampleProduct.id}`, {
    method: "PATCH",
    cookies: admin,
    body: JSON.stringify({ price: originalPrice + 1 }),
  });
  check(`Seed urun fiyat update -> 200`, update.status === 200, `got ${update.status} ${update.text.slice(0, 100)}`);

  const afterUpdate = await prisma.product.findUnique({ where: { id: sampleProduct.id } });
  check(`Fiyat gercekten degisti`, Number(afterUpdate?.price) === originalPrice + 1);

  // Geri yukle
  await prisma.product.update({
    where: { id: sampleProduct.id },
    data: { price: originalPrice },
  });

  // ── 2) Seed urun silme (siparisi yoksa hard, varsa soft) ──
  console.log("\n── 2) Seed urun silme ──");
  // Siparisi olmayan bir seed urun bul
  const unorderedSeed = await prisma.product.findFirst({
    where: {
      isPublished: true,
      orderItems: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      vatRate: true,
      stockQuantity: true,
      publisherId: true,
      categoryId: true,
      anaTur: true,
      nopId: true,
      slug: true,
      hasImage: true,
    },
  });
  if (unorderedSeed) {
    const delRes = await req(`/api/admin/products/${unorderedSeed.id}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Seed urun hard delete -> 200`, delRes.status === 200, `got ${delRes.status}`);
    check(`mode=hard`, delRes.json?.mode === "hard");

    const gone = await prisma.product.findUnique({ where: { id: unorderedSeed.id } });
    check(`Urun gercekten silindi`, gone === null);

    // Restore: geri ekle
    await prisma.product.create({
      data: {
        id: unorderedSeed.id,
        name: unorderedSeed.name,
        sku: unorderedSeed.sku,
        price: unorderedSeed.price,
        vatRate: unorderedSeed.vatRate,
        stockQuantity: unorderedSeed.stockQuantity,
        publisherId: unorderedSeed.publisherId,
        categoryId: unorderedSeed.categoryId,
        anaTur: unorderedSeed.anaTur,
        nopId: unorderedSeed.nopId,
        slug: unorderedSeed.slug,
        hasImage: unorderedSeed.hasImage,
        isPublished: true,
      },
    });
    console.log(`  (test urunu geri yuklendi)`);
  } else {
    console.log(`  (siparissiz seed urun bulunamadi, skip)`);
  }

  // Siparisi olan bir urun -> soft delete bekliyoruz
  const orderedSeed = await prisma.product.findFirst({
    where: { isPublished: true, orderItems: { some: {} } },
    select: { id: true, isPublished: true },
  });
  if (orderedSeed) {
    const softDel = await req(`/api/admin/products/${orderedSeed.id}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Siparisli urun soft delete -> 200`, softDel.status === 200);
    check(`mode=soft`, softDel.json?.mode === "soft");

    const softed = await prisma.product.findUnique({ where: { id: orderedSeed.id } });
    check(`isPublished=false`, softed?.isPublished === false);

    // Geri yayinla
    await prisma.product.update({
      where: { id: orderedSeed.id },
      data: { isPublished: true },
    });
    console.log(`  (urun geri yayinlandi)`);
  } else {
    console.log(`  (siparisli seed urun yok, skip)`);
  }

  // ── 3) Seed kategori silmeye calis -> 409, sonra force -> 200 ──
  console.log("\n── 3) Seed kategori silme (force) ──");
  const sampleCat = await prisma.category.findFirst({
    where: { products: { some: {} } },
  });
  if (sampleCat) {
    const normalDel = await req(`/api/admin/categories/${sampleCat.id}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Urunlu kategori normal delete -> 409`, normalDel.status === 409, `got ${normalDel.status}`);
    check(`productCount response'ta`, typeof normalDel.json?.productCount === "number");

    // force sil
    const affectedProducts = await prisma.product.findMany({
      where: { categoryId: sampleCat.id },
      select: { id: true, categoryId: true, name: true, slug: true },
    });
    const forceDel = await req(`/api/admin/categories/${sampleCat.id}?force=1`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Force delete -> 200`, forceDel.status === 200, `got ${forceDel.status}`);
    check(`detachedProducts dondu`, typeof forceDel.json?.detachedProducts === "number");

    const stillCat = await prisma.category.findUnique({ where: { id: sampleCat.id } });
    check(`Kategori silindi`, stillCat === null);

    const productsAfter = await prisma.product.findMany({
      where: { id: { in: affectedProducts.map((p) => p.id) } },
      select: { id: true, categoryId: true },
    });
    check(`Urunlerin categoryId null oldu`, productsAfter.every((p) => p.categoryId === null));

    // Geri yukle
    const restored = await prisma.category.create({
      data: {
        id: sampleCat.id,
        name: sampleCat.name,
        slug: sampleCat.slug,
        type: sampleCat.type,
      },
    });
    await prisma.product.updateMany({
      where: { id: { in: affectedProducts.map((p) => p.id) } },
      data: { categoryId: restored.id },
    });
    console.log(`  (kategori + urun iliskileri geri yuklendi)`);
  } else {
    console.log(`  (urunlu kategori yok, skip)`);
  }

  // ── 4) Seed yayinevi force silme ──
  console.log("\n── 4) Seed yayinevi silme (force) ──");
  const samplePub = await prisma.publisher.findFirst({
    where: { products: { some: {} } },
  });
  if (samplePub) {
    const normalDel = await req(`/api/admin/publishers/${samplePub.id}`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Urunlu yayinevi normal delete -> 409`, normalDel.status === 409);

    const affectedProducts = await prisma.product.findMany({
      where: { publisherId: samplePub.id },
      select: { id: true, publisherId: true },
    });
    const forceDel = await req(`/api/admin/publishers/${samplePub.id}?force=1`, {
      method: "DELETE",
      cookies: admin,
    });
    check(`Force delete -> 200`, forceDel.status === 200, `got ${forceDel.status}`);

    const gonePub = await prisma.publisher.findUnique({ where: { id: samplePub.id } });
    check(`Yayinevi silindi`, gonePub === null);

    const productsAfter = await prisma.product.findMany({
      where: { id: { in: affectedProducts.map((p) => p.id) } },
      select: { publisherId: true },
    });
    check(`Urunlerin publisherId null oldu`, productsAfter.every((p) => p.publisherId === null));

    // Restore
    const restored = await prisma.publisher.create({
      data: {
        id: samplePub.id,
        name: samplePub.name,
        slug: samplePub.slug,
      },
    });
    await prisma.product.updateMany({
      where: { id: { in: affectedProducts.map((p) => p.id) } },
      data: { publisherId: restored.id },
    });
    console.log(`  (yayinevi + urun iliskileri geri yuklendi)`);
  } else {
    console.log(`  (urunlu yayinevi yok, skip)`);
  }

  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
