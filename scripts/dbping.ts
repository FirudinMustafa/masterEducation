import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  try {
    await prisma.$queryRaw`SELECT 1 as v`;
    const products = await prisma.product.count();
    const users = await prisma.user.count();
    const orders = await prisma.order.count();
    console.log("DB-OK products=" + products, "users=" + users, "orders=" + orders);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    console.log("DB-FAIL code=", err.code, "msg=", (err.message || "").split("\n")[0]);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
