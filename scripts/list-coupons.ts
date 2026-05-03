import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const p = new PrismaClient({ adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL })) });
(async () => {
  const coupons = await p.coupon.findMany();
  console.log(`Total: ${coupons.length}`);
  coupons.forEach((c) => console.log(`  ${c.code} | ${c.kind} ${c.value} | active=${c.isActive} | used=${c.usedCount}/${c.maxUses ?? "∞"} | valid=${c.validFrom?.toISOString().slice(0, 10) ?? "-"}→${c.validUntil?.toISOString().slice(0, 10) ?? "-"}`));
  await p.$disconnect();
})();
