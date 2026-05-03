import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const [published, hidden, total, noImg, noImgPublished] = await Promise.all([
    prisma.product.count({ where: { isPublished: true } }),
    prisma.product.count({ where: { isPublished: false } }),
    prisma.product.count(),
    prisma.product.count({ where: { images: { none: {} } } }),
    prisma.product.count({ where: { isPublished: true, images: { none: {} } } }),
  ]);
  console.log("Yayindaki urun       :", published);
  console.log("Gizlenen urun        :", hidden);
  console.log("Toplam urun          :", total);
  console.log("Gorselsiz urun       :", noImg);
  console.log("Yayindaki gorselsiz  :", noImgPublished, "(0 olmali)");
  await prisma.$disconnect();
})();
