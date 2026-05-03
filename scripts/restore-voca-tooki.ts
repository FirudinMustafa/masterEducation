/**
 * VOCA TOOKI urununu geri yukler:
 * - ProductImage kaydini olusturur (pictureId 295627, dosya 0295627.png)
 * - Urunu isPublished=true + hasImage=true yapar
 * - Diger "phantom + image-dosyasi-var" urunleri de ayni sekilde duzeltir
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
const MAPPING_CSV = path.resolve(PROJECT_ROOT, "..", "ProductMapping.csv");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");

(async () => {
  // CSV: Id;ProductId;PictureId;DisplayOrder;Barcode;Sku;ColorId
  const raw = fs.readFileSync(MAPPING_CSV, "utf8");
  const lines = raw.split(/\r?\n/).slice(1).filter(Boolean);
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
  console.log(`Mapping CSV: ${mapping.size} urun`);

  // Disk'teki tum dosyalari pictureId'ye gore indekse al
  const allFiles = fs.readdirSync(IMAGES_DIR);
  const byPictureId = new Map<number, string>();
  for (const f of allFiles) {
    const m = f.match(/^0*(\d+)\.(png|jpeg|jpg|webp)$/i);
    if (m) {
      const pid = Number(m[1]);
      // En yuksek oncelik: base filename (_75/_350 gibi suffix'siz)
      if (!byPictureId.has(pid)) byPictureId.set(pid, f);
    }
  }

  // Phantom urunleri (hasImage=true ama image yok) ya da image eksigi olan urunleri bul
  const candidates = await prisma.product.findMany({
    where: {
      isPublished: false,
      hasImage: false,
      nopId: { in: [...mapping.keys()] },
    },
    select: { id: true, nopId: true, name: true, slug: true },
  });

  console.log(`\nKadyirilabilir aday: ${candidates.length}`);

  let restored = 0;
  let stillMissing = 0;

  for (const p of candidates) {
    const pics = mapping.get(p.nopId);
    if (!pics) continue;

    const imageCreates: Array<{ pictureId: number; filename: string; displayOrder: number }> = [];
    for (const { pictureId, displayOrder } of pics) {
      const file = byPictureId.get(pictureId);
      if (file) {
        imageCreates.push({ pictureId, filename: file, displayOrder });
      }
    }

    if (imageCreates.length === 0) {
      stillMissing++;
      continue;
    }

    // ProductImage kayitlarini olustur + urunu geri yayina al
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
  }

  console.log(`\n=== SONUC ===`);
  console.log(`Geri yuklenen: ${restored}`);
  console.log(`Hala gorseli yok: ${stillMissing}`);

  await prisma.$disconnect();
})();
