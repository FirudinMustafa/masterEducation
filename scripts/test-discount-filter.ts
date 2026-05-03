/**
 * Indirim filtresi testi:
 *  1) Rastgele 1 yayinda urunu sec, oldPrice = price * 1.5 yap (indirim senaryosu)
 *  2) Raw query ile oldPrice > price filtresi calisiyor mu dogrula
 *  3) oldPrice'i geri al
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const target = await prisma.product.findFirst({
    where: { isPublished: true, price: { gt: 0 }, oldPrice: null },
    select: { id: true, nopId: true, name: true, price: true },
  });
  if (!target) {
    console.log("Test icin uygun urun bulunamadi.");
    await prisma.$disconnect();
    return;
  }
  console.log(`Test urunu: ${target.nopId} ${target.name.slice(0, 40)} price=${target.price}`);

  const oldPrice = Number(target.price) * 1.5;
  await prisma.product.update({
    where: { id: target.id },
    data: { oldPrice },
  });
  console.log(`  oldPrice set edildi: ${oldPrice.toFixed(2)}`);

  const hits = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "products"
    WHERE "isPublished" = true
      AND "oldPrice" IS NOT NULL
      AND "oldPrice" > price
  `;
  const found = hits.some((h) => h.id === target.id);
  console.log(`  Raw query indirim filtresi: ${hits.length} urun buldu`);
  console.log(`  Test urunu filtrede: ${found ? "EVET ✓" : "HAYIR ✗"}`);

  // Kart rozeti icin beklenen yuzde
  const pct = Math.round(((oldPrice - Number(target.price)) / oldPrice) * 100);
  console.log(`  Beklenen kart rozeti: -%${pct}`);

  // Temizle
  await prisma.product.update({
    where: { id: target.id },
    data: { oldPrice: null },
  });
  console.log(`  oldPrice geri alindi (null).`);

  const postHits = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "products"
    WHERE "isPublished" = true
      AND "oldPrice" IS NOT NULL
      AND "oldPrice" > price
  `;
  console.log(`  Temizleme sonrasi indirim urunu: ${postHits.length}`);

  await prisma.$disconnect();
})();
