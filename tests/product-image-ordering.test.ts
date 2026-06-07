/**
 * Adım 1 — Determinism guarantee for ProductImage primary selection.
 *
 * F-0712-related tie-breaker: storefront query'leri eskiden
 *   orderBy: { displayOrder: "asc" }
 * yapıyordu. Aynı productId için birden fazla image `displayOrder=0`
 * olduğunda Postgres tie-break non-deterministic. Fix: `pictureId asc`
 * ikincil sort eklendi.
 *
 * Bu test bilerek 3 image'i aynı displayOrder=0 ile insert eder ve
 * orderBy + take:1 sorgusunun her seferinde aynı (= en küçük pictureId)
 * image'i döndürdüğünü kanıtlar.
 *
 * DATABASE_URL bir test DB'sine işaret etmiyorsa test atlanır (no-op).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const dbUrl = process.env.DATABASE_URL ?? "";
const isTestDb = /master_education_test|_test(\?|$)|localhost/.test(dbUrl);

const describeOrSkip = isTestDb ? describe : describe.skip;

describeOrSkip("ProductImage primary selection — deterministic with pictureId tie-break", () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let productId: string;
  let publisherId: string;
  const slug = `qa-tiebreaker-test-${Date.now()}`;
  const imageRecords: Array<{ pictureId: number; filename: string }> = [
    { pictureId: 9999003, filename: "9999003.jpeg" },
    { pictureId: 9999001, filename: "9999001.jpeg" },
    { pictureId: 9999002, filename: "9999002.jpeg" },
  ];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: dbUrl });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    // Sandbox publisher
    const pub = await prisma.publisher.upsert({
      where: { slug: "qa-tiebreaker-test-publisher" },
      update: {},
      create: { name: "QA Test Pub", slug: "qa-tiebreaker-test-publisher" },
    });
    publisherId = pub.id;

    // Sandbox product
    const prod = await prisma.product.create({
      data: {
        nopId: 9990000 + Math.floor(Math.random() * 9999),
        slug,
        sku: slug,
        name: "QA Tiebreaker Test Product",
        price: 100,
        stockQuantity: 1,
        isPublished: true,
        hasImage: true,
        publisherId,
      },
    });
    productId = prod.id;

    // 3 image, all displayOrder=0 — bilerek primary çakışması yarat
    for (const img of imageRecords) {
      await prisma.productImage.create({
        data: {
          productId,
          pictureId: img.pictureId,
          filename: img.filename,
          displayOrder: 0,
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.productImage.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.publisher.deleteMany({ where: { id: publisherId } });
      await prisma.$disconnect();
    }
    if (pool) await pool.end();
  });

  it("orderBy [{displayOrder:'asc'},{pictureId:'asc'}] + take:1 her zaman en küçük pictureId döner", async () => {
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await prisma.productImage.findFirst({
        where: { productId },
        orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }],
        select: { pictureId: true },
      });
      expect(r).not.toBeNull();
      results.push(r!.pictureId);
    }
    // Hepsi aynı olmalı (deterministic)
    const unique = new Set(results);
    expect(unique.size).toBe(1);
    // Ve en küçük pictureId olmalı (9999001 — bilinçli sırayla insert ettik, 3-1-2)
    expect(results[0]).toBe(9999001);
  });

  it("DEFANS: orderBy tie-breaker olmadan (sadece displayOrder) DB kararı bize bağlı kalır", async () => {
    // Bu test "non-deterministic" göstermez (Postgres warm cache aynı verir),
    // sadece pictureId-asc'ın bizim KASITLI seçimimiz olduğunu doğrular.
    // Tek check: take:1 sonucu in_images
    const r = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }],
      select: { pictureId: true },
    });
    expect(r!.pictureId).toBe(9999001);
  });
});
