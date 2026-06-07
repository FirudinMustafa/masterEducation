#!/usr/bin/env tsx
/**
 * diag-missing-files-csv.ts
 *
 * Adım 3: 57 kayıp dosya araştırması.
 *
 * Sorular:
 *   (Q1) Bu 57 pictureId, ProductMapping.csv'de listelenmiş mi?
 *   (Q2) Listelenmişse, ait oldukları ürün Product.csv'de aktif mi
 *        (Published=1, Deleted=0, Price>0)?
 *   (Q3) Sonuç: re-export gerekli mi yoksa hasImage=false meşru mu?
 *
 * Output: human-readable rapor + machine-readable JSON.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PARENT = path.resolve(__dirname, "..", "..");
const DISK_DIR = path.resolve(__dirname, "..", "public", "images", "products");
const EVIDENCE_DIR = path.resolve(__dirname, "..", "qa-run", "2026-05-18-1300", "evidence");

function readCsv(p: string): Record<string, string>[] {
  const raw = fs.readFileSync(p, "utf8").replace(/^﻿/, "");
  return parse(raw, { delimiter: ";", columns: true, skip_empty_lines: true, relax_column_count: true });
}

async function main() {
  // 1) Disk'teki dosya seti
  const diskSet = new Set<string>(
    fs.readdirSync(DISK_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)),
  );

  // 2) DB'deki product_images'da diskte olmayan dosyaları topla
  const allImages = await prisma.productImage.findMany({
    select: {
      pictureId: true,
      filename: true,
      productId: true,
      product: { select: { nopId: true, sku: true, name: true, isPublished: true, hasImage: true } },
    },
  });
  const missing = allImages.filter((i) => !diskSet.has(i.filename));

  // 3) CSV'leri oku
  const mappingPath = path.join(PARENT, "ProductMapping.csv");
  const productPath = path.join(PARENT, "Prdocut.csv");
  if (!fs.existsSync(mappingPath) || !fs.existsSync(productPath)) {
    console.error(`CSV bulunamadi:\n  ${mappingPath}\n  ${productPath}`);
    process.exit(1);
  }
  const mappingRows = readCsv(mappingPath);
  const productRows = readCsv(productPath);

  // pictureId -> { mapping row, productId (NopCommerce) }
  const pidMap = new Map<number, { mapping: Record<string, string>; nopProductId: number }>();
  for (const r of mappingRows) {
    const pid = parseInt(r["PictureId"]);
    const nopPid = parseInt(r["ProductId"]);
    if (!Number.isFinite(pid)) continue;
    if (!pidMap.has(pid)) pidMap.set(pid, { mapping: r, nopProductId: nopPid });
  }

  // nopProductId -> Product.csv row (aktif/inaktif kontrolü)
  const productMap = new Map<number, Record<string, string>>();
  for (const r of productRows) {
    const id = parseInt(r["Id"]);
    if (Number.isFinite(id)) productMap.set(id, r);
  }

  // 4) Analiz
  const results: Array<{
    filename: string;
    pictureId: number;
    productId: string;
    nopId: number;
    sku: string;
    name: string;
    inMappingCsv: boolean;
    inProductCsv: boolean;
    productPublished: boolean;
    productDeleted: boolean;
    productPrice: number;
    productActiveByFilter: boolean; // Published=1 && Deleted=0 && Price>0
    verdict: "re-export-needed" | "csv-missing-real" | "inactive-product" | "ok-as-missing";
  }> = [];

  for (const m of missing) {
    const inMap = pidMap.get(m.pictureId);
    const inProd = inMap ? productMap.get(inMap.nopProductId) : undefined;
    const published = inProd?.["Published"]?.trim() === "1";
    const deleted = inProd?.["Deleted"]?.trim() === "1";
    const price = parseFloat(inProd?.["Price"] || "0");
    const activeByFilter = published && !deleted && price > 0;

    let verdict: "re-export-needed" | "csv-missing-real" | "inactive-product" | "ok-as-missing";
    if (!inMap) {
      verdict = "csv-missing-real"; // CSV'de bile yok — gerçekten kayıp
    } else if (!inProd) {
      verdict = "csv-missing-real"; // pictureId var ama ürün CSV'de yok (orphan mapping)
    } else if (!activeByFilter) {
      verdict = "inactive-product"; // ürün aktif değil — hasImage=false makul
    } else {
      verdict = "re-export-needed"; // CSV'de var, ürün aktif, görsel disk'te yok → re-export
    }

    results.push({
      filename: m.filename,
      pictureId: m.pictureId,
      productId: m.productId,
      nopId: m.product?.nopId ?? -1,
      sku: m.product?.sku ?? "",
      name: m.product?.name ?? "",
      inMappingCsv: !!inMap,
      inProductCsv: !!inProd,
      productPublished: published,
      productDeleted: deleted,
      productPrice: price,
      productActiveByFilter: activeByFilter,
      verdict,
    });
  }

  // 5) Özet
  const byVerdict: Record<string, number> = {};
  for (const r of results) byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;

  console.log("=== Kayıp dosya analizi ===");
  console.log(`Toplam kayıp: ${results.length}`);
  for (const [v, n] of Object.entries(byVerdict)) console.log(`  ${v.padEnd(22)} : ${n}`);

  console.log("\n=== Detay (verdict bazlı) ===");
  for (const v of ["re-export-needed", "csv-missing-real", "inactive-product", "ok-as-missing"] as const) {
    const subset = results.filter((r) => r.verdict === v);
    if (subset.length === 0) continue;
    console.log(`\n--- ${v} (${subset.length}) ---`);
    subset.slice(0, 30).forEach((r) =>
      console.log(
        `  pid=${r.pictureId}  ${r.filename.padEnd(15)}  nopId=${r.nopId.toString().padEnd(6)} sku=${r.sku.padEnd(20)} ${r.name.slice(0, 50)}`,
      ),
    );
    if (subset.length > 30) console.log(`  ... +${subset.length - 30} satır daha`);
  }

  // 6) Evidence yaz
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = path.join(EVIDENCE_DIR, "missing-files-analysis.json");
  fs.writeFileSync(out, JSON.stringify({ summary: byVerdict, total: results.length, items: results }, null, 2), "utf8");
  console.log(`\nEvidence: ${out}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
