import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const p = new PrismaClient({ adapter: new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL })) });

(async () => {
  const coupons = await p.coupon.findMany({ where: { validUntil: { not: null } } });
  let fixed = 0;
  for (const c of coupons) {
    if (!c.validUntil) continue;
    const d = c.validUntil;
    // Herhangi bir saatte ise (muhtemelen midnight veya yakin saat), gunun
    // sonuna cek. Ama sadece bugun veya gelecek tarih ise fix edelim.
    if (d.getUTCHours() < 23) {
      const fixed_d = new Date(d);
      fixed_d.setUTCHours(23, 59, 59, 999);
      await p.coupon.update({ where: { id: c.id }, data: { validUntil: fixed_d } });
      fixed++;
      console.log(`  fixed ${c.code}: ${d.toISOString()} -> ${fixed_d.toISOString()}`);
    } else {
      console.log(`  skip ${c.code}: ${d.toISOString()} (zaten gunun sonu)`);
    }
  }
  console.log(`Toplam duzeltilen: ${fixed}`);
  await p.$disconnect();
})();
