#!/usr/bin/env tsx
/**
 * diag-csv-duplicate-primary.ts
 *
 * META-SEBEP araştırması: 703 ürünün ProductImage.displayOrder=0 çoklu kaydı
 * niye oluştu? Hipotezler:
 *   (1) CSV'nin kendisinde aynı ProductId için birden fazla satır DisplayOrder=0
 *   (2) seed.ts upsert iki kere koştu → unique constraint update etti, duplicate
 *       insert edemez. Yani bu hipotez fizibıl değil.
 *   (3) Başka bir import script duplicate üretiyor
 *
 * Bu script (1)'i kanıtlamak/çürütmek için doğrudan ProductMapping.csv'yi
 * ayrıştırıp düzeyinde sayım yapar.
 *
 * Çalıştırma:
 *   npx tsx scripts/diag-csv-duplicate-primary.ts
 */
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

const CSV_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "ProductMapping.csv"),
  path.resolve(__dirname, "..", "data", "ProductMapping.csv"),
];

const csvPath = CSV_CANDIDATES.find((p) => fs.existsSync(p));
if (!csvPath) {
  console.error("ProductMapping.csv bulunamadi. Adaylar:");
  CSV_CANDIDATES.forEach((p) => console.error("  -", p));
  process.exit(1);
}

console.log(`CSV: ${csvPath}`);

const raw = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const rows: Record<string, string>[] = parse(raw, {
  delimiter: ";",
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

console.log(`Toplam mapping satiri: ${rows.length}`);
console.log("Ilk satir sutunlari:", Object.keys(rows[0] ?? {}));
console.log("Ilk 3 ornek:", rows.slice(0, 3));

// Her ProductId için DisplayOrder=0 satırı sayısı
const primariesByProduct = new Map<string, number>();
const allByProduct = new Map<string, number>();
let zeroCount = 0;

for (const r of rows) {
  const pid = r["ProductId"];
  const ord = parseInt(r["DisplayOrder"] || "0");
  if (!pid) continue;
  allByProduct.set(pid, (allByProduct.get(pid) ?? 0) + 1);
  if (ord === 0) {
    zeroCount++;
    primariesByProduct.set(pid, (primariesByProduct.get(pid) ?? 0) + 1);
  }
}

console.log(`\nDisplayOrder=0 toplam satir: ${zeroCount}`);

// Histogram: kaç ürün kaç primary'ye sahip?
const hist: Record<number, number> = {};
for (const c of primariesByProduct.values()) {
  hist[c] = (hist[c] ?? 0) + 1;
}
console.log("\nProduct -> primary count histogram:");
Object.keys(hist)
  .sort((a, b) => Number(a) - Number(b))
  .forEach((k) => console.log(`  ${k} primary -> ${hist[Number(k)]} ürün`));

const dupProducts = [...primariesByProduct.entries()].filter(([, c]) => c > 1);
console.log(`\nÇoklu-primary olan ProductId sayisi (CSV'de): ${dupProducts.length}`);

// En çok primary'li 5 örneği göster
const top = dupProducts.sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log("\nEn çok primary'li 5 ProductId:");
for (const [pid, c] of top) {
  const productRows = rows.filter((r) => r["ProductId"] === pid);
  console.log(`  ProductId=${pid}  primary=${c}  toplam_satir=${productRows.length}`);
  productRows.slice(0, 8).forEach((r) =>
    console.log(`    PictureId=${r["PictureId"]}  DisplayOrder=${r["DisplayOrder"]}  Barcode=${r["Barcode"] ?? ""}`),
  );
}

// Tek bir ProductId için tam aynı satır iki kere var mı? (true duplicate row)
const seen = new Set<string>();
let trueDup = 0;
for (const r of rows) {
  const key = `${r["ProductId"]}|${r["PictureId"]}|${r["DisplayOrder"]}`;
  if (seen.has(key)) trueDup++;
  else seen.add(key);
}
console.log(`\nTAM-AYNI satir (ProductId+PictureId+DisplayOrder eşit): ${trueDup}`);

// Aynı (ProductId, PictureId) için farklı DisplayOrder var mı?
const ppMap = new Map<string, Set<string>>();
for (const r of rows) {
  const key = `${r["ProductId"]}|${r["PictureId"]}`;
  const set = ppMap.get(key) ?? new Set();
  set.add(r["DisplayOrder"]);
  ppMap.set(key, set);
}
const conflictingOrder = [...ppMap.entries()].filter(([, set]) => set.size > 1);
console.log(`Aynı (ProductId,PictureId) için farkli DisplayOrder: ${conflictingOrder.length}`);

console.log("\n=== SONUC ===");
if (dupProducts.length > 0) {
  console.log(`KANIT (1): CSV'nin kendisinde ${dupProducts.length} ürün için çoklu DisplayOrder=0 var.`);
  console.log("→ Hipotez doğrulandı. seed.ts upsert öncesi per-product collapse gerekli.");
} else {
  console.log("CSV temiz. Duplicate-primary başka bir kaynaktan geliyor olmalı.");
}
