import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const dealers = await prisma.dealer.findMany({
    include: { user: { select: { email: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log(`=== DEALER KAYITLARI (${dealers.length}) ===`);
  for (const d of dealers) {
    console.log(
      `${d.createdAt.toISOString()} | status=${d.status} | ${d.companyName} | ${d.user.email} | role=${d.user.role}`,
    );
  }

  const recent = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      email: true,
      role: true,
      createdAt: true,
      dealer: { select: { status: true } },
    },
  });
  console.log(`\n=== SON 10 KULLANICI ===`);
  for (const u of recent) {
    console.log(
      `${u.createdAt.toISOString()} | role=${u.role} | ${u.email} | dealer=${u.dealer ? u.dealer.status : "YOK"}`,
    );
  }

  await prisma.$disconnect();
  await pool.end();
})();
