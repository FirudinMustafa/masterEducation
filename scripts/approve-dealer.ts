/**
 * Bekleyen bir bayi basvurusunu onaylar.
 *
 * Kullanim:
 *   npx tsx scripts/approve-dealer.ts <email> [creditLimit]
 *   npx tsx scripts/approve-dealer.ts firudinmustafayev00@gmail.com 25000
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const email = process.argv[2];
  const limit = Number(process.argv[3] ?? 25000);

  if (!email) {
    console.error("Kullanim: npx tsx scripts/approve-dealer.ts <email> [creditLimit]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { dealer: true },
  });

  if (!user) {
    console.error(`✗ ${email}: kullanici bulunamadi`);
    process.exit(1);
  }
  if (!user.dealer) {
    console.error(`✗ ${email}: bu kullanicinin bayi basvurusu yok (/bayi-basvuru'dan once form doldurulmali)`);
    process.exit(1);
  }

  await prisma.dealer.update({
    where: { id: user.dealer.id },
    data: {
      status: "APPROVED",
      paymentTerms: "OPEN_ACCOUNT",
      creditLimit: limit,
      approvedAt: new Date(),
    },
  });

  // Role zaten DEALER olabilir; degilse yukselt
  if (user.role !== "DEALER") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "DEALER" } });
  }

  console.log(`\n✅ ${email} onaylandi.`);
  console.log(`   Sirket:      ${user.dealer.companyName}`);
  console.log(`   Limit:       ${limit.toLocaleString("tr-TR")} ₺`);
  console.log(`   Odeme modu:  OPEN_ACCOUNT`);
  console.log(`\n   Giris: http://localhost:3000/giris\n`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
