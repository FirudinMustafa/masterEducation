/**
 * Branded Excel roundtrip: generate a branded template, then parse it using
 * the same header-row detection logic the upload endpoints use. Proves that
 * our header-auto-detection handles the shifted layout caused by brand
 * decoration.
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

/** Aynisini upload/route.ts icinde yapiyoruz. */
function findHeaderRow(
  sheet: ExcelJS.Worksheet,
  requiredColumns: string[],
  lower = false,
): { rowNum: number; headers: string[] } | null {
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell((cell, col) => {
      const v = String(cell.value ?? "").trim();
      candidate[col - 1] = lower ? v.toLowerCase() : v;
    });
    const required = lower ? requiredColumns.map((c) => c.toLowerCase()) : requiredColumns;
    if (required.every((c) => candidate.includes(c))) {
      return { rowNum: r, headers: candidate };
    }
  }
  return null;
}

(async () => {
  console.log("\n=== BRANDED EXCEL ROUNDTRIP ===\n");

  // 1) Iskonto template benzeri
  console.log("1) Iskonto template header detection");
  const wb1 = createBrandedWorkbook();
  buildBrandedSheet(wb1, "Iskontolar", {
    title: "Iskonto Matrisi",
    subtitle: "Test",
    intro: "Intro metni",
    columns: [
      { header: "scope", key: "scope", width: 16 },
      { header: "discountPct", key: "discountPct", width: 12 },
      { header: "productId", key: "productId", width: 28 },
      { header: "productSku", key: "productSku", width: 18 },
      { header: "productName", key: "productName", width: 42 },
      { header: "publisherId", key: "publisherId", width: 28 },
      { header: "discountGroup", key: "discountGroup", width: 18 },
    ],
    rows: [
      { scope: "GLOBAL", discountPct: 10, productId: "", productSku: "", productName: "", publisherId: "", discountGroup: "" },
      { scope: "PRODUCT", discountPct: 25, productId: "prod-123", productSku: "SKU1", productName: "Test Urun", publisherId: "", discountGroup: "" },
    ],
  });

  const buf1 = await wb1.xlsx.writeBuffer();
  const path1 = path.join(OUT_DIR, "discount-roundtrip.xlsx");
  fs.writeFileSync(path1, Buffer.from(buf1 as ArrayBuffer));

  const reader1 = new ExcelJS.Workbook();
  const raw1 = fs.readFileSync(path1);
  await reader1.xlsx.load(raw1.buffer.slice(raw1.byteOffset, raw1.byteOffset + raw1.byteLength) as ArrayBuffer);
  const s1 = reader1.getWorksheet("Iskontolar")!;

  const found1 = findHeaderRow(s1, ["scope", "discountPct"]);
  check(`Header row bulundu (intro var → row 6)`, found1?.rowNum === 6, `got row ${found1?.rowNum}`);
  check("Headers scope + discountPct iceriyor", !!found1?.headers.includes("scope") && !!found1?.headers.includes("discountPct"));

  if (found1) {
    const iScope = found1.headers.indexOf("scope");
    const iPct = found1.headers.indexOf("discountPct");
    const dataRow = s1.getRow(found1.rowNum + 1);
    check("Ilk veri satiri scope=GLOBAL", String(dataRow.getCell(iScope + 1).value) === "GLOBAL");
    check("Ilk veri satiri pct=10", Number(dataRow.getCell(iPct + 1).value) === 10);
  }

  // 2) Bulk-order template benzeri (Turkce header, intro YOK — dolayisiyla row 6)
  console.log("\n2) Bulk-order template header detection (Turkce)");
  const wb2 = createBrandedWorkbook();
  buildBrandedSheet(wb2, "Siparis", {
    title: "Toplu Siparis Sablonu",
    subtitle: "Test",
    intro: "SKU ve miktar zorunlu",
    columns: [
      { header: "SKU", key: "sku", width: 22 },
      { header: "Adet", key: "quantity", width: 10 },
      { header: "Not (opsiyonel)", key: "note", width: 40 },
    ],
    rows: [
      { sku: "SKU-1", quantity: 2, note: "" },
      { sku: "SKU-2", quantity: 5, note: "ornek" },
    ],
  });

  const buf2 = await wb2.xlsx.writeBuffer();
  const path2 = path.join(OUT_DIR, "bulk-order-roundtrip.xlsx");
  fs.writeFileSync(path2, Buffer.from(buf2 as ArrayBuffer));

  const reader2 = new ExcelJS.Workbook();
  const raw2 = fs.readFileSync(path2);
  await reader2.xlsx.load(raw2.buffer.slice(raw2.byteOffset, raw2.byteOffset + raw2.byteLength) as ArrayBuffer);
  const s2 = reader2.getWorksheet("Siparis")!;

  // Parse endpoint toLowerCase uyguluyor, biz de ayni sekilde
  const found2 = findHeaderRow(s2, ["sku", "adet"], true);
  check(`Header row bulundu (intro var → row 6)`, found2?.rowNum === 6, `got row ${found2?.rowNum}`);
  check("'adet' veya 'quantity' var", !!found2?.headers.includes("adet") || !!found2?.headers.includes("quantity"));

  if (found2) {
    const iSku = found2.headers.indexOf("sku");
    const iAdet = found2.headers.indexOf("adet") >= 0 ? found2.headers.indexOf("adet") : found2.headers.indexOf("quantity");
    const dataRow = s2.getRow(found2.rowNum + 1);
    check("Ilk veri SKU='SKU-1'", String(dataRow.getCell(iSku + 1).value) === "SKU-1");
    check("Ilk veri adet=2", Number(dataRow.getCell(iAdet + 1).value) === 2);
  }

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
