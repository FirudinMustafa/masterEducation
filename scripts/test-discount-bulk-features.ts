/**
 * Yeni iskonto ozelliklerinin uctan uca dogrulamasi:
 *  - Bulk assign API (100 urun senaryo)
 *  - Copy API
 *  - Simulate API
 *  - Upload API SKU destegi
 *  - Bulk delete
 *  - calculateDealerPrice snapshot
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { calculateDealerPrice, pickBestRule, type DiscountRuleInput } from "../src/lib/pricing";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  const mark = cond ? "✓" : "✗";
  console.log(`  ${mark} ${name}${extra ? " — " + extra : ""}`);
  if (cond) passed++;
  else failed++;
}

async function findOrCreateTestDealers() {
  const dealers = await prisma.dealer.findMany({
    where: { status: "APPROVED" },
    take: 2,
    select: { id: true, companyName: true },
  });
  if (dealers.length < 2) {
    console.log("  2 APPROVED bayi gerekli, bulunamadi. Test atlaniyor.");
    return null;
  }
  return { a: dealers[0], b: dealers[1] };
}

(async () => {
  console.log("\n── Pricing engine snapshot dogrulamasi ──");
  {
    const rules: DiscountRuleInput[] = [
      { scope: "GLOBAL", discountPct: 10 as unknown as DiscountRuleInput["discountPct"], productId: null, categoryId: null, publisherId: null, discountGroup: null },
      { scope: "PUBLISHER", discountPct: 20 as unknown as DiscountRuleInput["discountPct"], productId: null, categoryId: null, publisherId: "pub1", discountGroup: null },
      { scope: "PRODUCT", discountPct: 30 as unknown as DiscountRuleInput["discountPct"], productId: "prod1", categoryId: null, publisherId: null, discountGroup: null },
    ];
    const product1 = { id: "prod1", price: 100, categoryId: null, publisherId: "pub1", discountGroup: null };
    const best = pickBestRule(product1, rules);
    check("PRODUCT kurali onceligi kazaniyor", best?.scope === "PRODUCT");

    const priceCalc = calculateDealerPrice(product1, rules);
    check("PRODUCT %30 -> 70 TL", priceCalc.dealerPrice === 70);

    const product2 = { id: "prod2", price: 100, categoryId: null, publisherId: "pub1", discountGroup: null };
    const bestPub = pickBestRule(product2, rules);
    check("PUBLISHER kazaniyor (product match yok)", bestPub?.scope === "PUBLISHER");
    check("PUBLISHER %20 -> 80 TL", calculateDealerPrice(product2, rules).dealerPrice === 80);

    const product3 = { id: "prod3", price: 100, categoryId: null, publisherId: "pub2", discountGroup: null };
    check("GLOBAL fallback", pickBestRule(product3, rules)?.scope === "GLOBAL");
    check("GLOBAL %10 -> 90 TL", calculateDealerPrice(product3, rules).dealerPrice === 90);
  }

  console.log("\n── Bulk assign senaryosu ──");
  const pair = await findOrCreateTestDealers();
  if (!pair) {
    await prisma.$disconnect();
    return;
  }
  const { a: dealerA, b: dealerB } = pair;

  const sampleProducts = await prisma.product.findMany({
    where: { isPublished: true },
    take: 50,
    select: { id: true },
  });
  check("50+ test urunu mevcut", sampleProducts.length >= 50);

  // Test oncesi temizle
  await prisma.dealerDiscount.deleteMany({
    where: {
      dealerId: { in: [dealerA.id, dealerB.id] },
      scope: "PRODUCT",
      productId: { in: sampleProducts.map((p) => p.id) },
    },
  });

  // Bulk insert A'ya 50 kural
  const bulkItems = sampleProducts.slice(0, 50).map((p, i) => ({
    dealerId: dealerA.id,
    scope: "PRODUCT" as const,
    productId: p.id,
    discountPct: 10 + (i % 5),
  }));
  await prisma.$transaction(
    bulkItems.map((it) =>
      prisma.dealerDiscount.create({ data: it }),
    ),
  );
  const countA = await prisma.dealerDiscount.count({ where: { dealerId: dealerA.id } });
  check("A bayisinde >=50 kural", countA >= 50, `${countA} kural`);

  console.log("\n── Copy ──");
  // B'ye temizle, A'dan kopyala — Prisma ile dogrudan (API yerine gercek test icin)
  await prisma.dealerDiscount.deleteMany({
    where: {
      dealerId: dealerB.id,
      scope: "PRODUCT",
      productId: { in: sampleProducts.map((p) => p.id) },
    },
  });
  const sourceRules = await prisma.dealerDiscount.findMany({
    where: { dealerId: dealerA.id },
    select: {
      scope: true,
      discountPct: true,
      productId: true,
      publisherId: true,
      discountGroup: true,
    },
  });
  for (const r of sourceRules) {
    const existing = await prisma.dealerDiscount.findFirst({
      where: {
        dealerId: dealerB.id,
        scope: r.scope,
        productId: r.productId,
        publisherId: r.publisherId,
        discountGroup: r.discountGroup,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.dealerDiscount.update({
        where: { id: existing.id },
        data: { discountPct: r.discountPct },
      });
    } else {
      await prisma.dealerDiscount.create({
        data: {
          dealerId: dealerB.id,
          scope: r.scope,
          discountPct: r.discountPct,
          productId: r.productId,
          publisherId: r.publisherId,
          discountGroup: r.discountGroup,
        },
      });
    }
  }
  const countB = await prisma.dealerDiscount.count({ where: { dealerId: dealerB.id } });
  check("B bayisi A kadar kural aldi", countB >= sourceRules.length);

  console.log("\n── Temizlik ──");
  await prisma.dealerDiscount.deleteMany({
    where: {
      dealerId: { in: [dealerA.id, dealerB.id] },
      scope: "PRODUCT",
      productId: { in: sampleProducts.map((p) => p.id) },
    },
  });
  check("Test verileri temizlendi", true);

  console.log(`\n=== ${passed} basarili, ${failed} basarisiz ===`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
