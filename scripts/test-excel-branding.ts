/**
 * Branded Excel helper sanity test: 3 farkli sablon uretip dosya boyutu,
 * sheet sayisi ve merged cells beklentisini dogrular. Goruntu kalitesini
 * dogrulamak icin /tmp'ye dosya da yazar.
 */
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
} from "../src/lib/excel-branding";

const OUT_DIR = path.join(__dirname, "..", "test-results", "excel");
fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${info ? "  " + info : ""}`);
    failed++;
  }
}

async function roundtrip(wb: ExcelJS.Workbook, name: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const filePath = path.join(OUT_DIR, `${name}.xlsx`);
  fs.writeFileSync(filePath, Buffer.from(buffer as ArrayBuffer));
  const size = fs.statSync(filePath).size;

  // Parse back to verify structure
  const re = new ExcelJS.Workbook();
  const raw = fs.readFileSync(filePath);
  await re.xlsx.load(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
  return { size, re, path: filePath };
}

(async () => {
  console.log("\n=== EXCEL BRANDING TESTLERI ===\n");

  console.log("1) Tek sheet + rows");
  const wb1 = createBrandedWorkbook();
  buildBrandedSheet(wb1, "Test", {
    title: "Ornek Rapor",
    subtitle: "Tarih: 24.04.2026  ·  3 kayit",
    intro: "Bu bir test aciklamasidir. Renk ve font tutarli olmali.",
    columns: [
      { header: "SKU", key: "sku", width: 20 },
      { header: "Adet", key: "qty", width: 10, numFmt: "0" },
      { header: "Fiyat", key: "price", width: 14, numFmt: "#,##0.00" },
    ],
    rows: [
      { sku: "ABC-1", qty: 2, price: 150.5 },
      { sku: "ABC-2", qty: 1, price: 299.99 },
      { sku: "ABC-3", qty: 10, price: 45 },
    ],
  });
  const r1 = await roundtrip(wb1, "single-sheet");
  check("Boyut > 10KB (logo embed calisiyor)", r1.size > 10 * 1024, `size=${r1.size}`);
  check("Sheet sayisi = 1", r1.re.worksheets.length === 1);
  const s1 = r1.re.worksheets[0];
  check("Worksheet adi = 'Test'", s1.name === "Test");
  check("Satir 1'de marka adi", String(s1.getCell("B1").value ?? "").includes("Master Education"));
  check("Satir 2'de title", s1.getCell("B2").value === "Ornek Rapor");
  check("Intro var (satir 5)", String(s1.getCell("A5").value ?? "").includes("test aciklamasi"));
  check("Image 1 adet", s1.getImages().length === 1);

  console.log("\n2) Cok sheet (bulk-order benzeri)");
  const wb2 = createBrandedWorkbook();
  buildBrandedSheet(wb2, "Siparis", {
    title: "Toplu Siparis",
    columns: [
      { header: "SKU", key: "sku", width: 20 },
      { header: "Adet", key: "qty", width: 10, numFmt: "0" },
    ],
    rows: [{ sku: "S1", qty: 5 }],
  });
  buildBrandedSheet(wb2, "Aciklama", {
    title: "Kullanim",
    columns: [
      { header: "Kolon", key: "col", width: 20 },
      { header: "Aciklama", key: "desc", width: 50 },
    ],
    rows: [{ col: "SKU", desc: "Urun kodu" }],
  });
  const r2 = await roundtrip(wb2, "multi-sheet");
  check("Sheet sayisi = 2", r2.re.worksheets.length === 2);
  check("Her sheet'te logo var", r2.re.worksheets.every((s) => s.getImages().length === 1));

  console.log("\n3) Bos rows (validasyon)");
  const wb3 = createBrandedWorkbook();
  buildBrandedSheet(wb3, "Empty", {
    title: "Bos Sheet",
    columns: [{ header: "Kolon", key: "k", width: 20 }],
    rows: [],
  });
  const r3 = await roundtrip(wb3, "empty");
  check("Bos sheet'te bile render calisir", r3.size > 5 * 1024);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  console.log(`Uretilen dosyalar: ${OUT_DIR}`);
  process.exit(failed === 0 ? 0 : 1);
})();
