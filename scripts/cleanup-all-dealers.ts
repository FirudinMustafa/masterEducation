/**
 * Tum bayi kayitlarini siler ve DEALER role'undeki kullanicilari CUSTOMER'a
 * dusurur. User hesaplari (siparis gecmisi, favorisi, vs.) korunur.
 *
 * Akis:
 *  1. Dealer.deleteMany — cascade ile DealerDiscount, DealerDocument,
 *     DealerLedger temizlenir (schema'da onDelete: Cascade)
 *  2. DEALER role'undeki user.role -> CUSTOMER
 *  3. dealerId'i sifirla User.role degisince session re-fetch yeni rolu okur
 *
 * Kullanim:  npx tsx scripts/cleanup-all-dealers.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // Snapshot oncesi
  const before = {
    dealers: await prisma.dealer.count(),
    discounts: await prisma.dealerDiscount.count(),
    documents: await prisma.dealerDocument.count(),
    ledger: await prisma.dealerLedger.count(),
    dealerUsers: await prisma.user.count({ where: { role: "DEALER" } }),
  };

  console.log("\n📊 Mevcut durum:");
  console.log(`   Dealer: ${before.dealers}`);
  console.log(`   DealerDiscount: ${before.discounts}`);
  console.log(`   DealerDocument: ${before.documents}`);
  console.log(`   DealerLedger: ${before.ledger}`);
  console.log(`   DEALER role'undeki user: ${before.dealerUsers}\n`);

  if (before.dealers === 0 && before.dealerUsers === 0) {
    console.log("✓ Zaten temiz, yapilacak bir sey yok.\n");
    await pool.end();
    return;
  }

  // 1) Dealer'lari sil — cascade ile alttakiler gider
  const deleted = await prisma.dealer.deleteMany({});
  console.log(`🗑️  ${deleted.count} dealer silindi (cascade ile alttakiler).\n`);

  // 2) DEALER role'undeki kullanicilari CUSTOMER yap (siparis gecmisleri korunur)
  const demoted = await prisma.user.updateMany({
    where: { role: "DEALER" },
    data: { role: "CUSTOMER" },
  });
  console.log(`🔻 ${demoted.count} kullanici CUSTOMER role'une dusuruldu.\n`);

  // Snapshot sonrasi
  const after = {
    dealers: await prisma.dealer.count(),
    discounts: await prisma.dealerDiscount.count(),
    documents: await prisma.dealerDocument.count(),
    ledger: await prisma.dealerLedger.count(),
    dealerUsers: await prisma.user.count({ where: { role: "DEALER" } }),
  };

  console.log("📊 Yeni durum:");
  console.log(`   Dealer: ${after.dealers}`);
  console.log(`   DealerDiscount: ${after.discounts}`);
  console.log(`   DealerDocument: ${after.documents}`);
  console.log(`   DealerLedger: ${after.ledger}`);
  console.log(`   DEALER role'undeki user: ${after.dealerUsers}\n`);

  console.log("✅ Hazirsin. Simdi:");
  console.log("   1. http://localhost:3000/kayit -> yeni hesap (veya mevcut hesabinla giris)");
  console.log("   2. http://localhost:3000/bayi-basvuru -> bayi basvurusu");
  console.log("   3. Admin onaylayinca DEALER role'u + Dealer record otomatik olusur\n");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
