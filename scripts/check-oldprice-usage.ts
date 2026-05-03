import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const [totalPublished, withOldPrice, withDiscount, sample] = await Promise.all([
    prisma.product.count({ where: { isPublished: true } }),
    prisma.product.count({ where: { isPublished: true, oldPrice: { not: null } } }),
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*)::bigint AS count
      FROM "products"
      WHERE "isPublished" = true
        AND "oldPrice" IS NOT NULL
        AND "oldPrice" > price
    `),
    prisma.product.findMany({
      where: { isPublished: true, oldPrice: { not: null } },
      select: { nopId: true, name: true, price: true, oldPrice: true },
      take: 5,
    }),
  ]);

  console.log(`Yayinda toplam urun         : ${totalPublished}`);
  console.log(`oldPrice != null olanlar    : ${withOldPrice}`);
  console.log(`oldPrice > price (indirimli): ${Number(withDiscount[0]?.count ?? 0)}`);
  if (sample.length > 0) {
    console.log("\nOrnekler (oldPrice null degil):");
    sample.forEach((p) => {
      console.log(
        `  ${p.nopId}: price=${p.price} oldPrice=${p.oldPrice} — ${p.name.slice(0, 45)}`,
      );
    });
  }
  await prisma.$disconnect();
})();
