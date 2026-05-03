/**
 * Test bayi hesabını giriş yapılabilir hale getirir.
 * - email: bayi@mastereducation.com.tr (mevcutsa update, yoksa create)
 * - password: Bayi123!
 * - status: APPROVED, paymentTerms: OPEN_ACCOUNT, creditLimit: 25000
 *
 * Çalıştır:  npx tsx scripts/setup-test-dealer.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "bayi@mastereducation.com.tr";
const PASSWORD = "Bayi123!";
const COMPANY = "Test Kitabevi (Demo)";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: "Demo Bayi",
      phone: "05551234567",
      role: "DEALER",
      passwordHash,
      emailVerified: new Date(),
    },
    update: {
      passwordHash,
      role: "DEALER",
      emailVerified: new Date(),
    },
  });

  const dealer = await prisma.dealer.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      companyName: COMPANY,
      taxNumber: "1234567890",
      taxOffice: "Beyoglu",
      contactPerson: "Demo Yetkili",
      status: "APPROVED",
      paymentTerms: "OPEN_ACCOUNT",
      creditLimit: 25000,
      currentBalance: 0,
      approvedAt: new Date(),
    },
    update: {
      status: "APPROVED",
      paymentTerms: "OPEN_ACCOUNT",
      creditLimit: 25000,
      approvedAt: new Date(),
    },
  });

  console.log("\n✅ Test bayi hazır.\n");
  console.log("─────────────────────────────────────");
  console.log("  URL:        http://localhost:3000/giris");
  console.log(`  Email:      ${EMAIL}`);
  console.log(`  Sifre:      ${PASSWORD}`);
  console.log(`  Sirket:     ${dealer.companyName}`);
  console.log(`  Durum:      ${dealer.status}`);
  console.log(`  Odeme:      ${dealer.paymentTerms}`);
  console.log(`  Kredi:      ${dealer.creditLimit} ₺`);
  console.log("─────────────────────────────────────\n");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
