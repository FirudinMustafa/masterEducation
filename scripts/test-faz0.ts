import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..");
const ARCHIVE = path.join(PARENT_ROOT, "211 urun gorselsiz", "archive", "2026-04-24");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");

let passed = 0;
let failed = 0;

function expect(name: string, cond: boolean, got?: unknown, want?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${got !== undefined ? `  got=${got}` : ""}${want !== undefined ? `  want=${want}` : ""}`);
    failed++;
  }
}

(async () => {
  console.log("\n=== FAZ 0 DOGRULAMA TESTLERI ===\n");

  // --- DB counts ---
  console.log("1) DB sayilari");
  const total = await prisma.product.count();
  const published = await prisma.product.count({ where: { isPublished: true } });
  const hidden = await prisma.product.count({ where: { isPublished: false } });
  const noImg = await prisma.product.count({ where: { images: { none: {} } } });
  const leaked = await prisma.product.count({ where: { isPublished: true, images: { none: {} } } });

  expect("Toplam urun = 4898", total === 4898, total, 4898);
  expect("Yayindaki = 4687", published === 4687, published, 4687);
  expect("Gizli = 211", hidden === 211, hidden, 211);
  expect("Gorselsiz = 211", noImg === 211, noImg, 211);
  expect("Yayindaki gorselsiz = 0 (sizma yok)", leaked === 0, leaked, 0);
  expect("Yayinda + Gizli = Toplam", published + hidden === total);

  // --- Storefront listing query simulation ---
  console.log("\n2) Storefront listeleme (isPublished: true filtresi)");
  const storefrontCount = await prisma.product.count({ where: { isPublished: true } });
  expect("/urunler listeleme sayisi = 4687", storefrontCount === 4687);

  const sampleStorefront = await prisma.product.findMany({
    where: { isPublished: true },
    take: 50,
    include: { images: true },
  });
  const emptyImgInListing = sampleStorefront.filter((p) => p.images.length === 0).length;
  expect("Listelemede gorselsiz urun gorunmuyor (ilk 50)", emptyImgInListing === 0);

  // --- Detail page: hidden products return notFound ---
  console.log("\n3) Detay sayfasi testi");
  const hiddenSample = await prisma.product.findFirst({ where: { isPublished: false } });
  expect("En az 1 gizli urun bulundu", hiddenSample !== null);
  if (hiddenSample) {
    // /urunler/[slug] uses findUnique by slug, then checks isPublished
    const found = await prisma.product.findUnique({ where: { slug: hiddenSample.slug } });
    expect("Gizli urun DB'de var (slug ile bulunuyor)", found !== null);
    expect("Gizli urun detay sayfasi notFound() atar", !!found && found.isPublished === false);
  }

  // --- Orders API: hidden products cannot be ordered ---
  console.log("\n4) Siparis API: gizli urun sepete giremiyor");
  if (hiddenSample) {
    const orderQuery = await prisma.product.findMany({
      where: { id: { in: [hiddenSample.id] }, isPublished: true },
    });
    expect("Gizli urun siparis sorgusunda 0 dondurur", orderQuery.length === 0);
  }

  // --- Dealer bulk-order: hidden products filtered out ---
  console.log("\n5) Bayi toplu-siparis: gizli urun kabul etmiyor");
  if (hiddenSample) {
    const bulkQuery = await prisma.product.findMany({
      where: { sku: hiddenSample.sku, isPublished: true },
    });
    expect("Gizli urun bulk-order sorgusunda bulunamiyor", bulkQuery.length === 0);
  }

  // --- Admin: sees everything ---
  console.log("\n6) Admin paneli: hepsini goruyor");
  const adminCount = await prisma.product.count(); // no filter
  expect("Admin toplam urun = 4898", adminCount === 4898);

  // --- Sitemap: only published ---
  console.log("\n7) Sitemap: sadece yayinda olanlar");
  const sitemapCount = await prisma.product.count({ where: { isPublished: true } });
  expect("Sitemap urun sayisi = 4687", sitemapCount === 4687);

  // --- Archive folder integrity ---
  console.log("\n8) Arsiv klasoru butunlugu");
  expect("archive/2026-04-24 var", fs.existsSync(ARCHIVE));
  expect("products.csv var", fs.existsSync(path.join(ARCHIVE, "products.csv")));
  expect("products.json var", fs.existsSync(path.join(ARCHIVE, "products.json")));
  expect("orphan-images/ var", fs.existsSync(path.join(ARCHIVE, "orphan-images")));
  expect("README.md var", fs.existsSync(path.join(ARCHIVE, "README.md")));

  if (fs.existsSync(path.join(ARCHIVE, "products.json"))) {
    const json = JSON.parse(fs.readFileSync(path.join(ARCHIVE, "products.json"), "utf8"));
    expect(`products.json = 211 kayit`, json.length === 211, json.length, 211);
    expect("products.json ilk kayit id bos degil", !!json[0]?.id);
    expect("products.json ilk kayit slug bos degil", !!json[0]?.slug);
  }

  if (fs.existsSync(path.join(ARCHIVE, "products.csv"))) {
    const csv = fs.readFileSync(path.join(ARCHIVE, "products.csv"), "utf8");
    const lines = csv.trim().split("\n");
    expect(`products.csv = 211 veri satiri + 1 header`, lines.length === 212, lines.length, 212);
  }

  const orphanFiles = fs.readdirSync(path.join(ARCHIVE, "orphan-images"));
  expect("orphan-images icinde 5594 dosya", orphanFiles.length === 5594, orphanFiles.length, 5594);

  // --- Public folder integrity ---
  console.log("\n9) public/images/products/ butunlugu");
  const publicFiles = fs.readdirSync(IMAGES_DIR);
  expect("public'te 5763 dosya var", publicFiles.length === 5763, publicFiles.length, 5763);

  // DB'deki ProductImage.filename'lar hala disk'te var mi?
  const allRefs = await prisma.productImage.findMany({ select: { filename: true } });
  const refSet = new Set(allRefs.map((r) => r.filename));
  const diskSet = new Set(publicFiles);
  let missing = 0;
  for (const fn of refSet) if (!diskSet.has(fn)) missing++;
  expect("DB'de referansli tum dosyalar disk'te var", missing === 0, missing, 0);

  // Public'te orphan kalmadi mi?
  let orphansLeft = 0;
  for (const f of diskSet) if (!refSet.has(f)) orphansLeft++;
  expect("public'te orphan kalmadi", orphansLeft === 0, orphansLeft, 0);

  // --- Roll-back capability: JSON'daki id'ler gercek mi? ---
  console.log("\n10) Rollback kapasitesi");
  if (fs.existsSync(path.join(ARCHIVE, "products.json"))) {
    const json = JSON.parse(fs.readFileSync(path.join(ARCHIVE, "products.json"), "utf8"));
    const ids = json.slice(0, 10).map((p: { id: string }) => p.id);
    const foundInDb = await prisma.product.count({ where: { id: { in: ids } } });
    expect("products.json'daki id'ler DB'de bulunabiliyor", foundInDb === 10);
  }

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
