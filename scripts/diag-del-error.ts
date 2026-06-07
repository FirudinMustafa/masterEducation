import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const u = await prisma.user.findFirst({
    where: { email: "firudinmustafayev00@gmail.com" },
    select: {
      id: true,
      _count: {
        select: { orders: true, addresses: true, reviews: true, orderEvents: true, cartItems: true },
      },
    },
  });
  console.log("user counts:", JSON.stringify(u?._count));
  try {
    await prisma.user.delete({ where: { id: u!.id } });
    console.log("deleted ok");
  } catch (e) {
    const err = e as { code?: string; meta?: unknown; message?: string };
    console.log("CODE:", err.code);
    console.log("META:", JSON.stringify(err.meta));
    console.log("MSG:", (err.message || "").replace(/\n/g, " ").slice(0, 400));
  }
  await prisma.$disconnect();
  await pool.end();
})();
