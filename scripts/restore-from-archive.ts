/**
 * Arsivdeki orphan gorseller arasinda ana dosyayi ara + geri yukle.
 * Ornek: arsivde `0123456_350.png` thumbnail var, ana `0123456.png` public'te yok.
 * Thumbnail'i ana olarak restore et.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PARENT = path.resolve(PROJECT_ROOT, "..");
const MAPPING_CSV = path.join(PARENT, "ProductMapping.csv");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");
const ARCHIVE_DIR = path.join(PARENT, "211 urun gorselsiz", "archive", "2026-04-24", "orphan-images");
const FIX = process.argv.includes("--fix");

(async () => {
  // Disk'teki dosyalari pictureId'ye gore indeksle
  const diskFiles = fs.readdirSync(IMAGES_DIR);
  const onDisk = new Map<number, string>();
  for (const f of diskFiles) {
    const m = f.match(/^0*(\d+)\.(png|jpeg|jpg|webp)$/i);
    if (m && !onDisk.has(Number(m[1]))) onDisk.set(Number(m[1]), f);
  }

  // Arsivde orphan dosyalari indeksle — ana ve thumbnail
  const archiveFiles = fs.existsSync(ARCHIVE_DIR) ? fs.readdirSync(ARCHIVE_DIR) : [];
  const inArchive = new Map<number, { main?: string; thumb?: string }>();
  for (const f of archiveFiles) {
    // Ana: 0123456.png
    // Thumbnail: 0123456_350.png
    const mainM = f.match(/^0*(\d+)\.(png|jpeg|jpg|webp)$/i);
    const thumbM = f.match(/^0*(\d+)_(\d+|[a-z-]+)\.(png|jpeg|jpg|webp)$/i);
    if (mainM) {
      const pid = Number(mainM[1]);
      const entry = inArchive.get(pid) ?? {};
      entry.main = f;
      inArchive.set(pid, entry);
    } else if (thumbM) {
      const pid = Number(thumbM[1]);
      const entry = inArchive.get(pid) ?? {};
      if (!entry.thumb) entry.thumb = f;
      inArchive.set(pid, entry);
    }
  }

  console.log(`Disk'te: ${onDisk.size} ana dosya`);
  console.log(`Arsivde: ${inArchive.size} farkli pictureId`);

  // CSV mapping
  const rawCsv = fs.readFileSync(MAPPING_CSV, "utf8");
  const lines = rawCsv.split(/\r?\n/).slice(1).filter(Boolean);
  const mapping = new Map<number, Array<{ pictureId: number; displayOrder: number }>>();
  for (const line of lines) {
    const parts = line.split(";");
    const nopId = Number(parts[1]);
    const pictureId = Number(parts[2]);
    const displayOrder = Number(parts[3]) || 0;
    if (!Number.isFinite(nopId) || !Number.isFinite(pictureId)) continue;
    const arr = mapping.get(nopId) ?? [];
    arr.push({ pictureId, displayOrder });
    mapping.set(nopId, arr);
  }

  // Hala gizli + phantom image durumunda urunler (onceki restore'dan geri kalanlar)
  const candidates = await prisma.product.findMany({
    where: {
      isPublished: false,
      images: { none: {} },
    },
    select: { id: true, nopId: true, name: true },
  });
  console.log(`\nGizli + image'siz urun: ${candidates.length}`);

  let restored = 0;
  let movedFromArchive = 0;

  for (const p of candidates) {
    const pics = mapping.get(p.nopId);
    if (!pics || pics.length === 0) continue;

    const imageCreates: Array<{ pictureId: number; filename: string; displayOrder: number }> = [];
    for (const { pictureId, displayOrder } of pics) {
      // Once disk'te ara
      let filename = onDisk.get(pictureId);

      // Yoksa arsivde ana veya thumbnail
      if (!filename) {
        const arc = inArchive.get(pictureId);
        if (arc) {
          const source = arc.main ?? arc.thumb;
          if (source) {
            // Arsivden disk'e tasi (kopyala)
            const srcPath = path.join(ARCHIVE_DIR, source);
            // Ana format varsa kullan, yoksa thumbnail'i "0xxxxx.png" seklinde rename
            const targetName = arc.main ?? source.replace(/_(\d+|[a-z-]+)\./, ".");
            const dstPath = path.join(IMAGES_DIR, targetName);
            if (FIX && !fs.existsSync(dstPath)) {
              fs.copyFileSync(srcPath, dstPath);
              movedFromArchive++;
            }
            filename = targetName;
            onDisk.set(pictureId, targetName);
          }
        }
      }

      if (filename) {
        imageCreates.push({ pictureId, filename, displayOrder });
      }
    }

    if (imageCreates.length === 0) continue;

    if (FIX) {
      await prisma.$transaction([
        ...imageCreates.map((img) =>
          prisma.productImage.create({
            data: {
              productId: p.id,
              pictureId: img.pictureId,
              filename: img.filename,
              displayOrder: img.displayOrder,
            },
          }),
        ),
        prisma.product.update({
          where: { id: p.id },
          data: { isPublished: true, hasImage: true },
        }),
      ]);
      restored++;
      console.log(`  ✓ ${p.nopId} ${p.name.slice(0, 50)} (${imageCreates.length} gorsel)`);
    } else {
      console.log(`  - ${p.nopId} ${p.name.slice(0, 50)} : ${imageCreates.length} gorsel bulundu (fix icin --fix)`);
    }
  }

  console.log(`\n=== SONUC ===`);
  console.log(`Geri yuklenen urun: ${restored}`);
  console.log(`Arsivden disk'e tasinan dosya: ${movedFromArchive}`);
  if (!FIX) console.log(`\n(Sadece rapor — --fix ile uygula)`);

  await prisma.$disconnect();
})();
