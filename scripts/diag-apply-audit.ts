import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const logs = await prisma.auditLog.findMany({
    where: { action: "DEALER_APPLY" },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log(`=== SON DEALER_APPLY AUDIT (${logs.length}) ===`);
  for (const l of logs) {
    console.log(
      `${l.createdAt.toISOString()} | ${JSON.stringify(l.metadata)}`,
    );
  }
  await prisma.$disconnect();
  await pool.end();
})();
