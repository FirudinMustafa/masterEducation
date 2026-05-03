import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const DRY_RUN = !process.argv.includes("--execute");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT_ROOT = path.resolve(PROJECT_ROOT, "..");
const ARCHIVE_ROOT = path.join(PARENT_ROOT, "211 urun gorselsiz", "archive");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  console.log(`\n=== ARCHIVE MISSING IMAGES — ${DRY_RUN ? "DRY RUN" : "EXECUTE"} ===\n`);

  // 1) Products whose ProductImage relation is empty
  const productsNoImage = await prisma.product.findMany({
    where: { images: { none: {} } },
    include: {
      publisher: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ publisherId: "asc" }, { name: "asc" }],
  });

  const alreadyUnpublished = productsNoImage.filter((p) => !p.isPublished).length;
  const stillPublished = productsNoImage.filter((p) => p.isPublished);

  console.log(`DB'de gorselsiz urun: ${productsNoImage.length}`);
  console.log(`  - Zaten gizli (isPublished=false): ${alreadyUnpublished}`);
  console.log(`  - Hala yayinda (isPublished=true): ${stillPublished.length}`);

  // Publisher breakdown
  const byPub = new Map<string, number>();
  for (const p of productsNoImage) {
    const pub = p.publisher?.name ?? "(yok)";
    byPub.set(pub, (byPub.get(pub) ?? 0) + 1);
  }
  console.log("\nYayinevi dagilimi (tum gorselsiz urunler):");
  for (const [pub, count] of [...byPub.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pub.padEnd(20)} ${count}`);
  }

  // 2) Orphan image files: files on disk that are NOT referenced in product_images
  const allImageRecords = await prisma.productImage.findMany({ select: { filename: true } });
  const referencedFilenames = new Set(allImageRecords.map((r) => r.filename));
  console.log(`\nDB'de ProductImage kayit: ${allImageRecords.length}`);

  const filesOnDisk = fs.existsSync(IMAGES_DIR) ? fs.readdirSync(IMAGES_DIR) : [];
  console.log(`Disk'teki dosya: ${filesOnDisk.length}`);

  const orphanFiles = filesOnDisk.filter((f) => !referencedFilenames.has(f));
  console.log(`Orphan dosya (DB'de kaydi olmayan): ${orphanFiles.length}`);

  // Also: referenced but missing on disk
  const missingOnDisk: string[] = [];
  for (const fn of referencedFilenames) {
    if (!filesOnDisk.includes(fn)) missingOnDisk.push(fn);
  }
  if (missingOnDisk.length > 0) {
    console.log(`⚠ DB'de kayit var ama disk'te yok: ${missingOnDisk.length}`);
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Hicbir degisiklik yapilmadi. --execute ile calistirin.\n");
    await prisma.$disconnect();
    return;
  }

  // === EXECUTE ===
  console.log("\n=== EXECUTE ===\n");

  // Create archive folder
  const stamp = new Date().toISOString().slice(0, 10);
  const runDir = path.join(ARCHIVE_ROOT, stamp);
  fs.mkdirSync(runDir, { recursive: true });
  const orphanDir = path.join(runDir, "orphan-images");
  fs.mkdirSync(orphanDir, { recursive: true });

  // Write products.csv (only the ones still published — those we'll soft-delete)
  const csvHeader = "NopId;Yayinevi;Kategori;Urun Adi;Urun Adi EN;SKU;Fiyat;Stok;Dil;Ana Tur;Detay Tur\n";
  const csvRows = stillPublished
    .map((p) =>
      [
        p.nopId,
        p.publisher?.name ?? "",
        p.category?.name ?? "",
        p.name,
        p.nameEn ?? "",
        p.sku,
        String(p.price).replace(".", ","),
        p.stockQuantity,
        p.language ?? "",
        p.anaTur ?? "",
        p.detayTur ?? "",
      ]
        .map(escapeCsv)
        .join(";"),
    )
    .join("\n");
  fs.writeFileSync(path.join(runDir, "products.csv"), csvHeader + csvRows + "\n", "utf8");

  // Write products.json (full data, richer)
  const jsonRows = stillPublished.map((p) => ({
    id: p.id,
    nopId: p.nopId,
    name: p.name,
    nameEn: p.nameEn,
    slug: p.slug,
    sku: p.sku,
    price: String(p.price),
    oldPrice: p.oldPrice ? String(p.oldPrice) : null,
    stockQuantity: p.stockQuantity,
    publisher: p.publisher?.name ?? null,
    category: p.category?.name ?? null,
    language: p.language,
    anaTur: p.anaTur,
    detayTur: p.detayTur,
    discountGroup: p.discountGroup,
    archivedAt: new Date().toISOString(),
  }));
  fs.writeFileSync(path.join(runDir, "products.json"), JSON.stringify(jsonRows, null, 2), "utf8");

  console.log(`✓ products.csv + products.json yazildi (${stillPublished.length} urun)`);

  // Move orphan images
  let movedCount = 0;
  for (const fn of orphanFiles) {
    const src = path.join(IMAGES_DIR, fn);
    const dst = path.join(orphanDir, fn);
    fs.renameSync(src, dst);
    movedCount++;
  }
  console.log(`✓ ${movedCount} orphan gorsel tasindi: ${orphanDir}`);

  // Soft-delete (isPublished=false) for products still published
  if (stillPublished.length > 0) {
    const ids = stillPublished.map((p) => p.id);
    const res = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { isPublished: false },
    });
    console.log(`✓ ${res.count} urun isPublished=false yapildi`);
  } else {
    console.log("Gorselsiz urunlerin hepsi zaten gizli, update'e gerek yok.");
  }

  // Write a README describing this archive
  const readme = `# Arsiv: ${stamp}

Tarih: ${new Date().toISOString()}
Islem: Gorselsiz urunler siteden gizlendi (soft delete: isPublished=false) ve arsivlendi.

## Istatistikler

- Toplam gorselsiz urun: ${productsNoImage.length}
- Bu calistirmada gizlenen: ${stillPublished.length}
- Zaten gizli olanlar: ${alreadyUnpublished}
- Tasinan orphan gorsel: ${orphanFiles.length}
${missingOnDisk.length > 0 ? `- DB'de kayit var ama disk'te olmayan: ${missingOnDisk.length}\n` : ""}
## Dosyalar

- \`products.csv\` — Gizlenen urunlerin CSV kaydi (gelecekte geri almak icin)
- \`products.json\` — Zengin JSON (id, slug, fiyat, stok, vb.)
- \`orphan-images/\` — DB'de kaydi olmayan gorsel dosyalari

## Geri alma

\`\`\`ts
// Tum bu urunleri geri yayinlamak icin:
await prisma.product.updateMany({
  where: { id: { in: [...idler] } },
  data: { isPublished: true },
});
\`\`\`

(idler icin products.json > id alanini kullanin)
`;
  fs.writeFileSync(path.join(runDir, "README.md"), readme, "utf8");

  console.log(`\n✓ Arsiv hazir: ${runDir}`);
  console.log("\n=== TAMAMLANDI ===\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
