/**
 * Urun toplu yukleme end-to-end testi. Template endpoint'inden uretilen
 * branded Excel ile bulk-import handler'ini bypass ederek ayni parse mantigini
 * calistir, ardindan DB'ye insert et.
 *
 * Dev server gerektirmez — icte ExcelJS + Prisma kullanir.
 */
import * as fs from "fs";
import * as path from "path";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
} from "../src/lib/excel-branding";
import { slugify } from "../src/lib/utils";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OUT_DIR = path.join(__dirname, "..", "test-results", "excel");
fs.mkdirSync(OUT_DIR, { recursive: true });

const TEST_SKU_PREFIX = "BULK-IMP-TEST-";
const TEST_NOP_START = 999000;

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

async function cleanup() {
  await prisma.product.deleteMany({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
  });
  await prisma.auditLog.deleteMany({
    where: { action: "PRODUCT_BULK_IMPORT", entityId: "(bulk)" },
  });
}

async function buildFile(rows: Array<Record<string, unknown>>): Promise<string> {
  const wb = createBrandedWorkbook();
  buildBrandedSheet(wb, "Urunler", {
    title: "Test Toplu Yukleme",
    subtitle: "Test",
    intro: "Test dosyasi",
    columns: [
      { header: "nopId", key: "nopId", width: 10 },
      { header: "name", key: "name", width: 40 },
      { header: "sku", key: "sku", width: 20 },
      { header: "price", key: "price", width: 12 },
      { header: "stockQuantity", key: "stockQuantity", width: 12 },
      { header: "publisher", key: "publisher", width: 20 },
      { header: "category", key: "category", width: 20 },
      { header: "isPublished", key: "isPublished", width: 12 },
    ],
    rows,
  });
  const buf = await wb.xlsx.writeBuffer();
  const fpath = path.join(OUT_DIR, "bulk-import-test.xlsx");
  fs.writeFileSync(fpath, Buffer.from(buf as ArrayBuffer));
  return fpath;
}

interface CellShape { value?: unknown }
function cellStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null) {
    const maybe = v as { richText?: { text: string }[]; text?: string };
    if (maybe.richText) return maybe.richText.map((t) => t.text).join("");
    if (maybe.text) return maybe.text;
  }
  return String(v).trim();
}

async function parseAndInsert(fpath: string): Promise<{ inserted: number; errors: unknown[] }> {
  const wb = new ExcelJS.Workbook();
  const raw = fs.readFileSync(fpath);
  await wb.xlsx.load(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
  const sheet = wb.getWorksheet("Urunler")!;

  // Header auto-detect (same logic as endpoint)
  let headerRowNum = -1;
  const headers: string[] = [];
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell((cell: CellShape, col) => {
      candidate[col - 1] = cellStr(cell.value);
    });
    if (candidate.includes("nopId") && candidate.includes("name") && candidate.includes("sku")) {
      headerRowNum = r;
      for (let i = 0; i < candidate.length; i++) headers[i] = candidate[i] ?? "";
      break;
    }
  }
  if (headerRowNum < 0) throw new Error("Header bulunamadi");

  const idx = (n: string) => headers.indexOf(n);
  const publishers = await prisma.publisher.findMany();
  const categories = await prisma.category.findMany();
  const pubByName = new Map(publishers.map((p) => [p.name.toLowerCase(), p]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const data: Array<{
    nopId: number; name: string; sku: string; slug: string; price: number;
    stockQuantity: number; publisherId: string | null; categoryId: string | null;
    isPublished: boolean; hasImage: boolean;
  }> = [];
  const slugCounts = new Map<string, number>();

  for (let rn = headerRowNum + 1; rn <= sheet.rowCount; rn++) {
    const row = sheet.getRow(rn);
    const nopIdRaw = cellStr(row.getCell(idx("nopId") + 1).value);
    if (!nopIdRaw) continue;
    // Footer atlamaci (parse edilemeyen nopId)
    const nopIdNum = Number(nopIdRaw);
    if (!Number.isInteger(nopIdNum) || nopIdNum <= 0) continue;
    const name = cellStr(row.getCell(idx("name") + 1).value);
    const sku = cellStr(row.getCell(idx("sku") + 1).value);
    const price = Number(cellStr(row.getCell(idx("price") + 1).value));
    const stock = Number(cellStr(row.getCell(idx("stockQuantity") + 1).value)) || 0;
    const pubName = cellStr(row.getCell(idx("publisher") + 1).value);
    const catName = cellStr(row.getCell(idx("category") + 1).value);
    const isPub = cellStr(row.getCell(idx("isPublished") + 1).value).toLowerCase() !== "false";

    const base = slugify(name) || `urun-${nopIdRaw}`;
    const count = slugCounts.get(base) ?? 0;
    slugCounts.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count + 1}`;

    data.push({
      nopId: Number(nopIdRaw),
      name,
      sku,
      slug,
      price,
      stockQuantity: stock,
      publisherId: pubName ? pubByName.get(pubName.toLowerCase())?.id ?? null : null,
      categoryId: catName ? catByName.get(catName.toLowerCase())?.id ?? null : null,
      isPublished: isPub,
      hasImage: false,
    });
  }

  const res = await prisma.product.createMany({ data });
  return { inserted: res.count, errors: [] };
}

(async () => {
  console.log("\n=== PRODUCT BULK IMPORT TEST ===\n");
  await cleanup();

  const pub = await prisma.publisher.findFirst();
  const cat = await prisma.category.findFirst();
  if (!pub || !cat) throw new Error("Test icin en az 1 yayinevi + 1 kategori gerekli");

  console.log("1) Branded template olustur + insert");
  const fpath = await buildFile([
    {
      nopId: TEST_NOP_START + 1,
      name: "TEST URUN 1",
      sku: TEST_SKU_PREFIX + "1",
      price: 100,
      stockQuantity: 10,
      publisher: pub.name,
      category: cat.name,
      isPublished: "TRUE",
    },
    {
      nopId: TEST_NOP_START + 2,
      name: "TEST URUN 2",
      sku: TEST_SKU_PREFIX + "2",
      price: 200,
      stockQuantity: 5,
      publisher: pub.name,
      category: "",
      isPublished: "TRUE",
    },
    {
      nopId: TEST_NOP_START + 3,
      name: "TEST URUN 3 (gizli)",
      sku: TEST_SKU_PREFIX + "3",
      price: 300,
      stockQuantity: 0,
      publisher: "",
      category: cat.name,
      isPublished: "FALSE",
    },
  ]);

  const result = await parseAndInsert(fpath);
  check("3 urun insert edildi", result.inserted === 3, `inserted=${result.inserted}`);

  const inserted = await prisma.product.findMany({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
    orderBy: { nopId: "asc" },
    include: { publisher: true, category: true },
  });
  check(`DB'de 3 kayit var`, inserted.length === 3, `got ${inserted.length}`);

  console.log("\n2) Alan dogrulama");
  check("1. urun publisher dolu", inserted[0]?.publisher?.name === pub.name);
  check("1. urun kategori dolu", inserted[0]?.category?.name === cat.name);
  check("2. urun kategori yok", inserted[1]?.categoryId === null);
  check("3. urun yayinda degil (isPublished=false)", inserted[2]?.isPublished === false);
  check("Slug benzersiz", new Set(inserted.map((p) => p.slug)).size === 3);

  console.log("\n3) Temizlik");
  await cleanup();
  const after = await prisma.product.count({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
  });
  check("Temizlikten sonra 0 kalan", after === 0);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
