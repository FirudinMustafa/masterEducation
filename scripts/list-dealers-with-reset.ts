/**
 * Tum DEALER kullanicilarin sifresini "Bayi123!" yapar ve listeler.
 *
 * UYARI: bu script tum bayi sifrelerini sifirlar (gercek email'ler dahil).
 * Sadece dev/test ortaminda kullanin.
 *
 * Kullanim:
 *   npx tsx scripts/list-dealers-with-reset.ts          (sadece listele)
 *   npx tsx scripts/list-dealers-with-reset.ts --reset  (sifrele + listele)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const NEW_PASSWORD = "Bayi123!";

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    const hash = await bcrypt.hash(NEW_PASSWORD, 10);
    const affected = await prisma.user.updateMany({
      where: { role: "DEALER" },
      data: { passwordHash: hash },
    });
    console.log(`\n✅ ${affected.count} bayi kullanicisinin sifresi "${NEW_PASSWORD}" olarak sifirlandi.\n`);
  } else {
    console.log(
      `\nℹ️  Sifre sifirlanmadi. --reset ile calistirinca tum bayilere "${NEW_PASSWORD}" atanir.\n`
    );
  }

  const dealers = await prisma.user.findMany({
    where: { role: "DEALER" },
    select: {
      email: true,
      name: true,
      dealer: {
        select: {
          companyName: true,
          status: true,
          paymentTerms: true,
          creditLimit: true,
          currentBalance: true,
        },
      },
    },
    orderBy: [{ dealer: { status: "asc" } }, { email: "asc" }],
  });

  // Sayisal limit/balance Decimal -> number cast
  type Row = (typeof dealers)[number];
  const rows = dealers.map((d: Row) => ({
    email: d.email,
    name: d.name ?? "—",
    company: d.dealer?.companyName ?? "—",
    status: d.dealer?.status ?? "—",
    terms: d.dealer?.paymentTerms ?? "—",
    limit: d.dealer ? Number(d.dealer.creditLimit) : 0,
    balance: d.dealer ? Number(d.dealer.currentBalance) : 0,
  }));

  console.log("Toplam bayi:", rows.length);
  console.log("─".repeat(110));
  console.log(
    "Email".padEnd(38),
    "Sirket".padEnd(25),
    "Durum".padEnd(11),
    "Odeme".padEnd(13),
    "Limit (₺)".padEnd(10),
    "Bakiye"
  );
  console.log("─".repeat(110));
  for (const r of rows) {
    console.log(
      r.email.padEnd(38),
      r.company.slice(0, 24).padEnd(25),
      r.status.padEnd(11),
      r.terms.padEnd(13),
      r.limit.toLocaleString("tr-TR").padStart(10),
      r.balance.toLocaleString("tr-TR")
    );
  }
  console.log("─".repeat(110));
  if (reset) {
    console.log(`\n🔑 Tum bayilerin sifresi: ${NEW_PASSWORD}`);
    console.log("   Giris: http://localhost:3000/giris?bayi=1\n");
    console.log("ℹ️  PENDING durumundaki bayiler giris yapabilir ama /bayi paneline duser:");
    console.log("    - APPROVED -> tam erisim");
    console.log("    - PENDING -> bekleme ekrani");
    console.log("    - SUSPENDED/REJECTED -> erisim engelli\n");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
