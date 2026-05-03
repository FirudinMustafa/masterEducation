import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  try {
    const r = await prisma.user.deleteMany({
      where: { email: { contains: "testfaz7" } },
    });
    console.log("Test users deleted:", r.count);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
