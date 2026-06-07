#!/usr/bin/env tsx
/**
 * fix-duplicate-primary-images.ts
 *
 * Tek ürün için birden fazla image satırının `displayOrder=0` tutulması
 * (= "primary") sorununu kalıcı düzeltir. Sebep: NopCommerce import'unda
 * aynı ürüne ait birden fazla `Picture_Product_Mapping` kaydı `DisplayOrder=0`
 * geliyor; seed.ts şu an dedupe etmiyor.
 *
 * Strateji: Her productId içinde, image'leri `pictureId` (stable, deterministic
 * NopCommerce ID) sırasına göre 0, 1, 2, ... olarak yeniden numaralandırır.
 *
 * Garantiler:
 *  - Idempotent (re-run no-op). Sadece DEĞİŞEN satırları update eder.
 *  - Transaction içinde. Lock: ROW EXCLUSIVE (UPDATE'in standart lock'u).
 *  - Pre-check ve post-verify; invariant ihlali → exception + stack.
 *  - Backup JSONL yalnız ETKİLENEN satırları içerir; satır sayısı=updated.
 *
 * Çalıştırma:
 *   DATABASE_URL=postgresql://... npx tsx scripts/fix-duplicate-primary-images.ts --dry-run
 *   DATABASE_URL=postgresql://... npx tsx scripts/fix-duplicate-primary-images.ts
 *
 * Production deploy:
 *   1. Staging'de bu script'i koş, evidence al, dry-run + apply + re-run kanıtla.
 *   2. Production öncesi DB-level backup (pg_dump --table=product_images).
 *   3. Production'da `npx tsx scripts/fix-duplicate-primary-images.ts` (idempotent).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL env required.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EVIDENCE_DIR = path.resolve(__dirname, "..", "qa-run", "2026-05-18-1300", "evidence");
const BACKUP_FILE = path.join(EVIDENCE_DIR, "fix-dup-primary-backup.jsonl");

interface Counts {
  totalRows: number;
  distinctProducts: number;
  dupPrimaryProducts: number;
  extraPrimaryRows: number;
  productsWithoutZeroPrimary: number;
  minDisplayOrderNotZero: number; // primary semantiği ihlali sayısı
}

async function captureCounts(): Promise<Counts> {
  const [row] = await prisma.$queryRawUnsafe<Counts[]>(`
    SELECT
      (SELECT COUNT(*)::int FROM product_images) AS "totalRows",
      (SELECT COUNT(DISTINCT "productId")::int FROM product_images) AS "distinctProducts",
      (SELECT COUNT(*)::int FROM (
        SELECT "productId" FROM product_images
        WHERE "displayOrder" = 0
        GROUP BY "productId"
        HAVING COUNT(*) > 1
      ) t) AS "dupPrimaryProducts",
      (SELECT COALESCE(SUM(c-1),0)::int FROM (
        SELECT COUNT(*) AS c
        FROM product_images
        WHERE "displayOrder" = 0
        GROUP BY "productId"
        HAVING COUNT(*) > 1
      ) t2) AS "extraPrimaryRows",
      (SELECT COUNT(*)::int FROM (
        SELECT "productId"
        FROM product_images
        GROUP BY "productId"
        HAVING NOT bool_or("displayOrder" = 0)
      ) t3) AS "productsWithoutZeroPrimary",
      (SELECT COUNT(*)::int FROM (
        SELECT "productId", MIN("displayOrder") AS m
        FROM product_images
        GROUP BY "productId"
        HAVING MIN("displayOrder") <> 0
      ) t4) AS "minDisplayOrderNotZero";
  `);
  return row;
}

function fmtCounts(label: string, c: Counts): string {
  return `[${label}]
  total_rows                         : ${c.totalRows}
  distinct_products                  : ${c.distinctProducts}
  dup_primary_products  (target=0)   : ${c.dupPrimaryProducts}
  extra_primary_rows    (target=0)   : ${c.extraPrimaryRows}
  products_without_zero_primary (=0) : ${c.productsWithoutZeroPrimary}
  min_displayOrder_not_zero (=0)     : ${c.minDisplayOrderNotZero}`;
}

async function projectChanges(): Promise<{ rowsToChange: number; productsAffected: number }> {
  const [r] = await prisma.$queryRawUnsafe<{ rowsToChange: number; productsAffected: number }[]>(`
    WITH ranked AS (
      SELECT
        id,
        "productId",
        "displayOrder" AS old_order,
        (ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "pictureId" ASC) - 1)::int AS new_order
      FROM product_images
    ),
    diffs AS (
      SELECT id, "productId" FROM ranked WHERE old_order <> new_order
    )
    SELECT
      (SELECT COUNT(*)::int FROM diffs) AS "rowsToChange",
      (SELECT COUNT(DISTINCT "productId")::int FROM diffs) AS "productsAffected";
  `);
  return r;
}

async function sampleBeforeAfter(limit = 5): Promise<string> {
  const samples = await prisma.$queryRawUnsafe<
    { productId: string; product_name: string; sku: string; sample: string }[]
  >(`
    WITH dup AS (
      SELECT "productId"
      FROM product_images
      WHERE "displayOrder" = 0
      GROUP BY "productId"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, "productId"
      LIMIT ${limit}
    ),
    ranked AS (
      SELECT
        pi."productId",
        pi."pictureId",
        pi."displayOrder" AS old_order,
        ROW_NUMBER() OVER (PARTITION BY pi."productId" ORDER BY pi."pictureId" ASC) - 1 AS new_order
      FROM product_images pi
      JOIN dup d ON d."productId" = pi."productId"
    )
    SELECT
      r."productId",
      p.name AS product_name,
      p.sku,
      string_agg(
        format('pid=%s old=%s -> new=%s', r."pictureId", r.old_order, r.new_order),
        E'\\n      '
        ORDER BY r."pictureId"
      ) AS sample
    FROM ranked r
    JOIN products p ON p.id = r."productId"
    GROUP BY r."productId", p.name, p.sku
    ORDER BY r."productId";
  `);
  return samples
    .map((s) => `  • ${s.sku}  ${s.product_name.slice(0, 60)}\n      ${s.sample}`)
    .join("\n");
}

async function explainAnalyze(): Promise<string> {
  // EXPLAIN (no ANALYZE) — query-plan-only, no execute. ANALYZE varyantı
  // gerçek UPDATE çalıştırırdı; rollback-edilse de istenmeyen yan etki riski
  // var. Plan-only çıktı, lock seviyesi ve maliyet için yeterli.
  const plan = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(`
    EXPLAIN (BUFFERS, VERBOSE)
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "pictureId" ASC) - 1 AS new_order
      FROM product_images
    )
    UPDATE product_images pi
    SET "displayOrder" = r.new_order
    FROM ranked r
    WHERE pi.id = r.id
      AND pi."displayOrder" <> r.new_order
  `);
  return plan.map((p) => "    " + p["QUERY PLAN"]).join("\n");
}

async function writeAffectedRowsBackup(): Promise<{ file: string; rowCount: number }> {
  // Only rows that will change — backup = footprint of the update.
  // ROW_NUMBER returns BIGINT in Postgres → cast to int for clean JSON.
  const rows = await prisma.$queryRawUnsafe<
    {
      id: string;
      productId: string;
      pictureId: number;
      filename: string;
      displayOrder: number;
      newDisplayOrder: number;
    }[]
  >(`
    WITH ranked AS (
      SELECT
        id,
        "productId",
        "pictureId",
        filename,
        "displayOrder",
        (ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "pictureId" ASC) - 1)::int AS new_order
      FROM product_images
    )
    SELECT
      id,
      "productId",
      "pictureId",
      filename,
      "displayOrder",
      new_order AS "newDisplayOrder"
    FROM ranked
    WHERE "displayOrder" <> new_order
    ORDER BY "productId", "pictureId";
  `);

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  // BigInt-safe stringify (kalan exotic tip varsa Number'a düşür)
  const safeStringify = (r: unknown) =>
    JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  fs.writeFileSync(
    BACKUP_FILE,
    rows.map(safeStringify).join("\n") + (rows.length ? "\n" : ""),
    "utf8",
  );
  return { file: BACKUP_FILE, rowCount: rows.length };
}

async function applyRenumber(): Promise<number> {
  const updated = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRawUnsafe<{ updated: number }[]>(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY "productId" ORDER BY "pictureId" ASC) - 1 AS new_order
        FROM product_images
      ),
      upd AS (
        UPDATE product_images pi
        SET "displayOrder" = r.new_order
        FROM ranked r
        WHERE pi.id = r.id
          AND pi."displayOrder" <> r.new_order
        RETURNING pi.id
      )
      SELECT COUNT(*)::int AS updated FROM upd;
    `);
    return row.updated;
  });
  return updated;
}

async function assertPostInvariants(before: Counts, after: Counts, updated: number, backupRows: number) {
  const errs: string[] = [];
  if (after.dupPrimaryProducts !== 0) errs.push(`dup_primary_products = ${after.dupPrimaryProducts} (beklenen 0)`);
  if (after.productsWithoutZeroPrimary !== 0) errs.push(`products_without_zero_primary = ${after.productsWithoutZeroPrimary} (beklenen 0)`);
  if (after.minDisplayOrderNotZero !== 0) errs.push(`min_displayOrder_not_zero = ${after.minDisplayOrderNotZero} (beklenen 0)`);
  if (after.totalRows !== before.totalRows) errs.push(`total_rows değişti: ${before.totalRows} -> ${after.totalRows} (renumber yapmalı, satır eklemez/silmez)`);
  if (after.distinctProducts !== before.distinctProducts) errs.push(`distinct_products değişti: ${before.distinctProducts} -> ${after.distinctProducts}`);
  if (backupRows !== updated) errs.push(`backup row count (${backupRows}) != updated row count (${updated})`);

  if (errs.length) {
    console.error("\n❌ POST-INVARIANT İHLALİ:");
    errs.forEach((e) => console.error("  - " + e));
    throw new Error("post-invariants failed");
  }
  console.log(`
✅ POST-INVARIANTS OK
  • dup_primary_products            = 0
  • products_without_zero_primary   = 0
  • min_displayOrder_not_zero       = 0
  • total_rows ÖNCE = SONRA          = ${after.totalRows}
  • distinct_products ÖNCE = SONRA   = ${after.distinctProducts}
  • backup_rows == updated_rows     = ${backupRows}`);
}

async function main() {
  console.log(`fix-duplicate-primary-images — mode=${dryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`DB: ${(process.env.DATABASE_URL ?? "").replace(/:[^/@]+@/, ":***@")}`);

  const before = await captureCounts();
  console.log("\n" + fmtCounts("BEFORE", before));

  if (before.dupPrimaryProducts === 0 && before.productsWithoutZeroPrimary === 0 && before.minDisplayOrderNotZero === 0) {
    console.log(`
ℹ Veri zaten temiz — yapılacak iş YOK (idempotent no-op).
  • dry-run: 0 değişiklik
  • apply : 0 satır etkilenir
  • Bu durum, script'in ikinci kez koşulmasına da uygun.`);
    await prisma.$disconnect();
    return;
  }

  const proj = await projectChanges();
  console.log(`\nIMPACT ESTIMATE
  • Renumber edilecek satır       : ${proj.rowsToChange}
  • Etkilenen ürün sayısı         : ${proj.productsAffected}
  • Tablo kilidi (UPDATE ile)     : ROW EXCLUSIVE (concurrent SELECT engellenmez)
  • Tablo lock-free read için OK  : evet (Postgres MVCC)`);

  console.log("\nSAMPLES (5 en çok primary'li ürün için BEFORE→AFTER):");
  console.log(await sampleBeforeAfter(5));

  console.log("\nQUERY PLAN (UPDATE):");
  console.log(await explainAnalyze());

  if (dryRun) {
    console.log("\n[DRY-RUN] Update atlanacak. Yukarıdaki BEFORE/SAMPLES/IMPACT/PLAN bilgileri yeterli.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nBackup (yalnız etkilenen satırlar)...");
  const backup = await writeAffectedRowsBackup();
  console.log(`Backup: ${backup.file}  (${backup.rowCount} satır)`);

  console.log("\nRenumber çalıştırılıyor (transactional)...");
  const updated = await applyRenumber();
  console.log(`Güncellenen satır sayısı: ${updated}`);

  const after = await captureCounts();
  console.log("\n" + fmtCounts("AFTER", after));

  await assertPostInvariants(before, after, updated, backup.rowCount);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n💥 HATA:", err);
  await prisma.$disconnect();
  process.exit(1);
});
