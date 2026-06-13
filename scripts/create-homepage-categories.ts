/**
 * Ana sayfa için 8 "ana" kategoriyi oluşturur (varsa atlar — idempotent).
 * Ürünleri bu kategorilere taşıma işi ayrıca admin panelindeki
 * Kategoriler → "Birleştir" / Ürünler → "Toplu Güncelle" araçlarıyla yapılır.
 *
 * Kullanım:
 *   npx tsx scripts/create-homepage-categories.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";
import { slugify } from "../src/lib/utils";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY_NAMES = [
  "Ders Kitabı",
  "Yardımcı Ders Kaynağı",
  "Hikaye Kitabı",
  "Skills Kitabı",
  "Dijital",
  "Kültür Kitabı",
  "Öğretmen Kitabı",
  "Sözlük",
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const name of CATEGORY_NAMES) {
    const slug = slugify(name);
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      // Var olan kaydı "ana" tipe çek (vitrinde görünsün).
      if (existing.type !== "ana") {
        await prisma.category.update({ where: { id: existing.id }, data: { type: "ana" } });
      }
      console.log(`= atlandı (mevcut): ${name} (${slug})`);
      skipped++;
      continue;
    }
    await prisma.category.create({ data: { name, slug, type: "ana" } });
    console.log(`+ oluşturuldu: ${name} (${slug})`);
    created++;
  }
  console.log(`\nTamam — ${created} oluşturuldu, ${skipped} atlandı.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
