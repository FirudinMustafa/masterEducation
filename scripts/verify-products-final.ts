import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const total = await prisma.product.count();
  const published = await prisma.product.count({ where: { isPublished: true } });
  const hidden = await prisma.product.count({ where: { isPublished: false } });
  const hiddenNoImage = await prisma.product.count({
    where: { isPublished: false, images: { none: {} } },
  });
  console.log("Toplam urun      :", total);
  console.log("Yayinda          :", published);
  console.log("Gizli (toplam)   :", hidden);
  console.log("Gizli + imaj yok :", hiddenNoImage);
  await prisma.$disconnect();
})();
