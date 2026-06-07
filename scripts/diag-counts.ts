import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  console.log("Ürün     :", await prisma.product.count());
  console.log("Kategori :", await prisma.category.count());
  console.log("Yayınevi :", await prisma.publisher.count());
  console.log("Kupon    :", await prisma.coupon.count());
  console.log("Kullanıcı:", await prisma.user.count());
  console.log("Bayi     :", await prisma.dealer.count());
  console.log("Sipariş  :", await prisma.order.count());
  await prisma.$disconnect();
  await pool.end();
})();
