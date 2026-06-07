#!/usr/bin/env tsx
/**
 * diag-product-images.ts
 *
 * Görsel boşluğu teşhisi: DB ↔ disk uyumu, eksik dosyalar, eksik DB satırları,
 * dosya uzantısı tutarsızlığı, displayOrder anomalileri, primary-image dağılımı.
 *
 * Çalıştırma:
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/master_education_test \
 *     npx tsx scripts/diag-product-images.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DISK_DIR = path.resolve(__dirname, "..", "public", "images", "products");

async function main() {
  console.log("=== DISK ===");
  if (!fs.existsSync(DISK_DIR)) {
    console.error(`DISK DIR NOT FOUND: ${DISK_DIR}`);
    process.exit(1);
  }
  const diskFiles = fs.readdirSync(DISK_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const diskSet = new Set(diskFiles);
  const byExt: Record<string, number> = {};
  for (const f of diskFiles) {
    const ext = path.extname(f).toLowerCase();
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  console.log(`Disk dosyalari : ${diskFiles.length}`);
  console.log(`Uzantilara gore:`, byExt);

  console.log("\n=== DB ===");
  const totalProducts = await prisma.product.count();
  const withFlag = await prisma.product.count({ where: { hasImage: true } });
  const withoutFlag = totalProducts - withFlag;
  console.log(`Toplam urun : ${totalProducts}`);
  console.log(`hasImage=true : ${withFlag}`);
  console.log(`hasImage=false: ${withoutFlag}`);

  const totalImages = await prisma.productImage.count();
  console.log(`product_images satir sayisi: ${totalImages}`);

  const allImages = await prisma.productImage.findMany({
    select: { id: true, filename: true, productId: true, displayOrder: true, pictureId: true },
  });

  // 1) DB'de var, diskte YOK
  const dbButNotDisk = allImages.filter((i) => !diskSet.has(i.filename));
  console.log(`\n[A] DB satiri var, dosya diskte YOK : ${dbButNotDisk.length}`);
  if (dbButNotDisk.length > 0) {
    console.log("  Ornekler:");
    dbButNotDisk.slice(0, 15).forEach((i) =>
      console.log(`    ${i.filename}  (pictureId=${i.pictureId}, productId=${i.productId})`),
    );
  }

  // 2) Disk'te var, DB'de YOK (orphan dosyalar)
  const dbFilenames = new Set(allImages.map((i) => i.filename));
  const orphanFiles = diskFiles.filter((f) => !dbFilenames.has(f));
  console.log(`\n[B] Dosya diskte var, DB'de referans YOK (orphan) : ${orphanFiles.length}`);
  if (orphanFiles.length > 0) {
    console.log("  Ornekler:");
    orphanFiles.slice(0, 15).forEach((f) => console.log(`    ${f}`));
  }

  // 3) Uzantı çakışması: aynı pictureId.jpeg DB'de ama disk'te .png var (veya tersi)
  const pictureIds = allImages.map((i) => ({ pictureId: i.pictureId, filename: i.filename }));
  const extMismatch: { dbName: string; diskAlt: string }[] = [];
  for (const { pictureId, filename } of pictureIds) {
    if (!diskSet.has(filename)) {
      // DB filename eksik — diskte aynı pictureId ile farklı uzantı var mı?
      const candidates = [".jpeg", ".jpg", ".png", ".webp"].map(
        (e) => `${String(pictureId).padStart(7, "0")}${e}`,
      );
      const alt = candidates.find((c) => c !== filename && diskSet.has(c));
      if (alt) extMismatch.push({ dbName: filename, diskAlt: alt });
    }
  }
  console.log(`\n[C] Uzanti uyusmazligi (DB diyor .X, diskte .Y): ${extMismatch.length}`);
  if (extMismatch.length > 0) {
    console.log("  Ornekler:");
    extMismatch.slice(0, 15).forEach((m) => console.log(`    DB: ${m.dbName}  -> DISK: ${m.diskAlt}`));
  }

  // 4) Primary (displayOrder=0) image olmayan urunler
  const productsWithFlag = await prisma.product.findMany({
    where: { hasImage: true },
    select: { id: true, name: true, sku: true, images: { select: { displayOrder: true, filename: true } } },
  });
  const noPrimary = productsWithFlag.filter(
    (p) => !p.images.some((i) => i.displayOrder === 0),
  );
  console.log(`\n[D] hasImage=true ama displayOrder=0 image YOK : ${noPrimary.length}`);
  if (noPrimary.length > 0) {
    noPrimary.slice(0, 10).forEach((p) =>
      console.log(`    ${p.sku}  ${p.name.slice(0, 50)}  (toplam ${p.images.length} resim, hicbiri displayOrder=0)`),
    );
  }

  // 5) Aynı productId'de birden fazla displayOrder=0 (UI'de tek seçim yapamayabilir)
  const dupPrimary: { productId: string; count: number }[] = [];
  for (const p of productsWithFlag) {
    const primaries = p.images.filter((i) => i.displayOrder === 0);
    if (primaries.length > 1) dupPrimary.push({ productId: p.id, count: primaries.length });
  }
  console.log(`\n[E] Bir urunde >1 primary (displayOrder=0) : ${dupPrimary.length}`);

  // 6) hasImage=true ama hicbir image yok
  const flagButNoImages = productsWithFlag.filter((p) => p.images.length === 0);
  console.log(`\n[F] hasImage=true ama image yok : ${flagButNoImages.length}`);
  if (flagButNoImages.length > 0) {
    flagButNoImages.slice(0, 5).forEach((p) =>
      console.log(`    ${p.sku}  ${p.name.slice(0, 50)}`),
    );
  }

  // 7) hasImage=true ama TÜM image dosyaları diskte yok (UI %100 kırık)
  const allBrokenProducts = productsWithFlag.filter(
    (p) => p.images.length > 0 && p.images.every((i) => !diskSet.has(i.filename)),
  );
  console.log(`\n[G] hasImage=true ama TUM image dosyalari diskte YOK : ${allBrokenProducts.length}`);
  if (allBrokenProducts.length > 0) {
    allBrokenProducts.slice(0, 10).forEach((p) =>
      console.log(`    ${p.sku}  ${p.name.slice(0, 50)}  (${p.images.map((i) => i.filename).join(", ")})`),
    );
  }

  // 8) Boyut özet: diskte hangi dosya boyutu aralıkları?
  const sizes = diskFiles.map((f) => fs.statSync(path.join(DISK_DIR, f)).size);
  sizes.sort((a, b) => a - b);
  const total = sizes.reduce((a, b) => a + b, 0);
  const median = sizes[Math.floor(sizes.length / 2)];
  const min = sizes[0];
  const max = sizes[sizes.length - 1];
  const lt5kb = sizes.filter((s) => s < 5 * 1024).length;
  console.log(`\n=== Disk dosya boyutlari ===`);
  console.log(`Toplam : ${(total / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Min    : ${min} byte  (suspicious <5KB count: ${lt5kb})`);
  console.log(`Median : ${(median / 1024).toFixed(1)} KB`);
  console.log(`Max    : ${(max / 1024 / 1024).toFixed(2)} MB`);

  // 9) Production: NEXT_PUBLIC_BLOB_BASE_URL var mı?
  console.log(`\n=== Env ===`);
  console.log(`NEXT_PUBLIC_BLOB_BASE_URL : ${process.env.NEXT_PUBLIC_BLOB_BASE_URL ? "SET (Blob kullanir)" : "BOS (lokal /public/images/products/ kullanir)"}`);

  // 10) Özet ve sonuç tavsiyesi
  console.log(`\n=== OZET ===`);
  const realProductLevelBroken = allBrokenProducts.length;
  console.log(`Goruntulenemeyecek urun sayisi (UI'de kirik gozukur) : ${realProductLevelBroken}`);
  const totalAffected = realProductLevelBroken + flagButNoImages.length + withoutFlag;
  console.log(`Hicbir gorsel gostermeyen urun TOPLAMI : ${totalAffected} / ${totalProducts} (%${((totalAffected / totalProducts) * 100).toFixed(1)})`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
