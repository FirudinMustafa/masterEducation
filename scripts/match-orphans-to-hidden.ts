/**
 * Gizli urunler (isPublished=false + image kaydi 0) ile arsivdeki orphan
 * dosyalar arasinda ESLESME ARAYALIM.
 *
 * Eslesme yollari:
 *   1. ProductMapping.csv — nopId -> pictureId, arsivde o pictureId'nin dosyasi var mi
 *   2. Dosya adi SKU iceriyor mu (ornek: "0295627_voca-took-almanca.png")
 *   3. Dosya adi nopId iceriyor mu
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
const ARCHIVE_DIR = path.join(PARENT, "211 urun gorselsiz", "archive", "2026-04-24", "orphan-images");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");

(async () => {
  // 1) Gizli urunler
  const hidden = await prisma.product.findMany({
    where: { isPublished: false, images: { none: {} } },
    select: {
      id: true,
      nopId: true,
      name: true,
      sku: true,
      slug: true,
      publisher: { select: { name: true } },
    },
  });
  console.log(`\nGizli urun (image yok): ${hidden.length}`);

  // 2) CSV mapping: nopId -> pictureIds
  const mapping = new Map<number, number[]>();
  const csv = fs.readFileSync(MAPPING_CSV, "utf8");
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const parts = line.split(";");
    const nopId = Number(parts[1]);
    const pictureId = Number(parts[2]);
    if (!Number.isFinite(nopId) || !Number.isFinite(pictureId)) continue;
    const arr = mapping.get(nopId) ?? [];
    arr.push(pictureId);
    mapping.set(nopId, arr);
  }
  console.log(`CSV: ${mapping.size} nopId'nin pictureId eslestirmesi var`);

  // 3) Arsivdeki dosyalari pictureId'ye gore indeksle
  const archiveFiles = fs.existsSync(ARCHIVE_DIR) ? fs.readdirSync(ARCHIVE_DIR) : [];
  const archiveByPictureId = new Map<number, { main: string[]; thumbs: string[] }>();
  for (const f of archiveFiles) {
    const m = f.match(/^0*(\d+)(_[a-zA-Z0-9-]+)?\.(png|jpeg|jpg|webp)$/i);
    if (!m) continue;
    const pid = Number(m[1]);
    const isThumb = !!m[2];
    const entry = archiveByPictureId.get(pid) ?? { main: [], thumbs: [] };
    if (isThumb) entry.thumbs.push(f);
    else entry.main.push(f);
    archiveByPictureId.set(pid, entry);
  }
  console.log(`Arsivde: ${archiveByPictureId.size} farkli pictureId (toplam ${archiveFiles.length} dosya)`);

  // 4) Disk'te var mi kontrolu
  const diskFiles = new Set(fs.readdirSync(IMAGES_DIR));

  // 5) Gizli urunler icin eslesme rapor et
  type Match = {
    nopId: number;
    name: string;
    sku: string;
    publisher: string;
    picturesInCsv: number[];
    diskHits: Array<{ pictureId: number; file: string }>;
    archiveMainHits: Array<{ pictureId: number; file: string }>;
    archiveThumbHits: Array<{ pictureId: number; file: string }>;
  };

  const matches: Match[] = [];

  for (const p of hidden) {
    const pics = mapping.get(p.nopId) ?? [];
    const diskHits: Match["diskHits"] = [];
    const archiveMainHits: Match["archiveMainHits"] = [];
    const archiveThumbHits: Match["archiveThumbHits"] = [];

    for (const pid of pics) {
      const padded = String(pid).padStart(7, "0");
      for (const ext of ["png", "jpeg", "jpg", "webp"]) {
        const name = `${padded}.${ext}`;
        if (diskFiles.has(name)) {
          diskHits.push({ pictureId: pid, file: name });
          break;
        }
      }
      const arc = archiveByPictureId.get(pid);
      if (arc) {
        for (const f of arc.main) archiveMainHits.push({ pictureId: pid, file: f });
        for (const f of arc.thumbs) archiveThumbHits.push({ pictureId: pid, file: f });
      }
    }

    if (pics.length > 0 || diskHits.length > 0 || archiveMainHits.length > 0 || archiveThumbHits.length > 0) {
      matches.push({
        nopId: p.nopId,
        name: p.name,
        sku: p.sku,
        publisher: p.publisher?.name ?? "?",
        picturesInCsv: pics,
        diskHits,
        archiveMainHits,
        archiveThumbHits,
      });
    }
  }

  // Raporla
  const csvOnly = matches.filter((m) => m.picturesInCsv.length > 0 && m.diskHits.length === 0 && m.archiveMainHits.length === 0 && m.archiveThumbHits.length === 0);
  const recoverableFromArchive = matches.filter((m) => m.archiveMainHits.length > 0 || m.archiveThumbHits.length > 0);
  const recoverableFromDisk = matches.filter((m) => m.diskHits.length > 0);

  console.log(`\n=== ESLESME RAPORU ===\n`);
  console.log(`CSV'de PictureId var ama hicbir yerde dosya yok  : ${csvOnly.length}`);
  console.log(`Disk'te dosya bulduk (zaten public'te)           : ${recoverableFromDisk.length}`);
  console.log(`Arsivde ANA dosya + thumbnail bulduk             : ${recoverableFromArchive.length}`);

  if (recoverableFromDisk.length > 0) {
    console.log(`\n── Disk'te dosya olanlar (hemen baglanabilir): ──`);
    for (const m of recoverableFromDisk) {
      console.log(`  ${m.nopId} ${m.publisher} : ${m.name.slice(0, 45)}`);
      m.diskHits.forEach((h) => console.log(`    ✓ disk: ${h.file}`));
    }
  }

  if (recoverableFromArchive.length > 0) {
    console.log(`\n── Arsivden restore edilebilir: ──`);
    for (const m of recoverableFromArchive) {
      console.log(`  ${m.nopId} ${m.publisher} : ${m.name.slice(0, 45)}`);
      m.archiveMainHits.forEach((h) => console.log(`    ✓ arsiv main: ${h.file}`));
      m.archiveThumbHits.slice(0, 3).forEach((h) => console.log(`    ~ arsiv thumb: ${h.file}`));
    }
  }

  if (csvOnly.length > 0 && csvOnly.length <= 20) {
    console.log(`\n── CSV'de var ama dosya hic yok (manuel upload lazim): ──`);
    csvOnly.forEach((m) =>
      console.log(`  ${m.nopId} ${m.publisher} : ${m.name.slice(0, 50)} (pictureIds: ${m.picturesInCsv.join(",")})`),
    );
  }

  // SKU bazli arsiv tarama — orphan'in icinde SKU geciyor mu
  console.log(`\n=== SKU BAZLI ESLESME (orphan dosya adinda SKU arama) ===\n`);
  let skuMatches = 0;
  for (const p of hidden) {
    const skuClean = p.sku.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (skuClean.length < 4) continue;
    const found = archiveFiles.filter((f) =>
      f.toLowerCase().replace(/[^a-z0-9]/g, "").includes(skuClean),
    );
    if (found.length > 0) {
      skuMatches++;
      console.log(`  ${p.nopId} SKU=${p.sku}`);
      found.slice(0, 3).forEach((f) => console.log(`    ${f}`));
    }
  }
  console.log(`SKU bazinda eslesme: ${skuMatches} urun`);

  await prisma.$disconnect();
})();
