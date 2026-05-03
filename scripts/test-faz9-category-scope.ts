/**
 * Faz 9 dogrulama: CATEGORY scope iskonto end-to-end (gercek DB).
 *
 *  1. Bir test bayisi olustur (APPROVED, OPEN_ACCOUNT)
 *  2. Mevcut kategoriden bir ürünü sec
 *  3. Bayinin kategoriye %25 CATEGORY scope iskonto kuralı tanımla
 *  4. priceProductsForDealer ile ürün fiyatı bayi için hesaplansin
 *     → matchedScope=CATEGORY, dealerPrice = listPrice * 0.75
 *  5. Aynı bayiye PRODUCT scope %35 ekle → PRODUCT kazanmali (PRODUCT > CATEGORY)
 *  6. Cleanup
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  let userId: string | null = null;
  let pass = 0;
  let total = 0;
  const ok = (n: string) => {
    pass++;
    console.log(`  ✓ ${n}`);
  };
  const fail = (n: string, x?: unknown) => {
    console.log(`  ✗ ${n}`, x ?? "");
  };
  const check = (n: string, cond: boolean, x?: unknown) => {
    total++;
    if (cond) ok(n);
    else fail(n, x);
  };

  try {
    const { priceProductsForDealer } = await import("../src/lib/pricing");

    // Kategori-li bir ürün bul
    const product = await prisma.product.findFirst({
      where: {
        isPublished: true,
        categoryId: { not: null },
        stockQuantity: { gt: 0 },
      },
      select: { id: true, name: true, price: true, categoryId: true },
    });
    if (!product || !product.categoryId) throw new Error("Kategoriden urun yok!");
    console.log(
      "[1] Test product:",
      product.name,
      "price:",
      Number(product.price),
      "categoryId:",
      product.categoryId
    );

    // Test bayi olustur
    const ts = Date.now();
    const email = `faz9-cat-${ts}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Faz9 Test",
        passwordHash: await bcrypt.hash("test1234", 10),
        role: "DEALER",
        emailVerified: new Date(),
        dealer: {
          create: {
            companyName: "Faz9 Co",
            taxOffice: "X",
            taxNumber: "1234567890",
            status: "APPROVED",
            paymentTerms: "OPEN_ACCOUNT",
            creditLimit: 10000,
          },
        },
      },
      include: { dealer: true },
    });
    userId = user.id;
    const dealerId = user.dealer!.id;

    // Senaryo A: sadece CATEGORY %25
    await prisma.dealerDiscount.create({
      data: {
        dealerId,
        scope: "CATEGORY",
        categoryId: product.categoryId,
        discountPct: 25,
      },
    });

    const map1 = await priceProductsForDealer([product.id], dealerId);
    const p1 = map1.get(product.id);
    const expected = Math.round(Number(product.price) * 0.75 * 100) / 100;
    check("CATEGORY rule matched", p1?.matchedScope === "CATEGORY");
    check(
      `dealerPrice = listPrice * 0.75 (${expected})`,
      p1?.dealerPrice === expected,
      { got: p1?.dealerPrice, expected }
    );
    check("discountPct = 25", p1?.discountPct === 25);

    // Senaryo B: PRODUCT %35 ekle → PRODUCT kazansin
    await prisma.dealerDiscount.create({
      data: {
        dealerId,
        scope: "PRODUCT",
        productId: product.id,
        discountPct: 35,
      },
    });

    const map2 = await priceProductsForDealer([product.id], dealerId);
    const p2 = map2.get(product.id);
    const expected2 = Math.round(Number(product.price) * 0.65 * 100) / 100;
    check("PRODUCT > CATEGORY", p2?.matchedScope === "PRODUCT");
    check(
      `dealerPrice = listPrice * 0.65 (${expected2})`,
      p2?.dealerPrice === expected2,
      { got: p2?.dealerPrice, expected: expected2 }
    );

    // Senaryo C: kategorisi olmayan urun → CATEGORY rule eslemesin
    const noCategoryProduct = await prisma.product.findFirst({
      where: { isPublished: true, categoryId: null },
      select: { id: true, price: true },
    });
    if (noCategoryProduct) {
      const map3 = await priceProductsForDealer([noCategoryProduct.id], dealerId);
      const p3 = map3.get(noCategoryProduct.id);
      check(
        "CATEGORY ignored when product has no categoryId",
        p3?.matchedScope !== "CATEGORY"
      );
    } else {
      console.log("  (kategorisi olmayan urun yok, senaryo C atlandi)");
    }

    // Senaryo D: HTTP POST /api/admin/discounts CATEGORY scope kabul ediyor mu?
    // (Admin auth olmadigi icin sadece schema validation 401 oncesinde gecmeli — test atlandi)

    console.log(`\n[2] Result: ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
  } finally {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      console.log("[cleanup] test user deleted");
    }
    await prisma.$disconnect();
    await pool.end();
  }
})();
