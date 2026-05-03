/**
 * Eski bayi (artik CUSTOMER role'unde olan) kullanicilari siler.
 * Bunlar bir onceki cleanup-all-dealers.ts'den dusurulmus user'lardir.
 *
 * KORUMA:
 *  - ADMIN hesaplari korunur
 *  - Order'i olan kullanicilar anonymize edilir (silinmez), KVKK hatti
 *  - Order'i olmayan + DEALER'dan dusurulmus = hard delete
 *
 * Belirleme: User'in dealerStatus relation'i yok artik (silindi),
 * ama orijinal email'lerden tahmin edebiliriz. Daha guvenli yol:
 * tum CUSTOMER role'undeki ve sipariş geçmişi olmayan user'lari kaldirmak.
 *
 * TARGETS arg ile email listesi vererek spesifik silme:
 *   npx tsx scripts/cleanup-old-dealer-users.ts a@b.com c@d.com
 *
 * Argsiz: dry-run (sadece listeler).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");

  if (targets.length === 0) {
    console.log("\nKullanim:");
    console.log("  npx tsx scripts/cleanup-old-dealer-users.ts <email1> <email2> ... [--apply]");
    console.log("\nArgsiz cagriylda hicbirsey silinmez. --apply olmadan sadece listeler.\n");
    await pool.end();
    return;
  }

  for (const email of targets) {
    const u = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, _count: { select: { orders: true } } },
    });
    if (!u) {
      console.log(`✗ ${email}: bulunamadi`);
      continue;
    }
    if (u.role === "ADMIN") {
      console.log(`⚠️  ${email}: ADMIN (atlandi)`);
      continue;
    }
    const hasOrders = u._count.orders > 0;
    if (apply) {
      if (hasOrders) {
        // Anonymize — order'lari korur
        await prisma.user.update({
          where: { id: u.id },
          data: {
            email: `deleted-${u.id}@example.invalid`,
            name: "Silinen Kullanici",
            phone: null,
            passwordHash: "",
          },
        });
        console.log(`◌ ${email}: anonimlestirildi (${u._count.orders} siparis)`);
      } else {
        await prisma.user.delete({ where: { id: u.id } });
        console.log(`✓ ${email}: silindi (siparis yok)`);
      }
    } else {
      console.log(
        `→ ${email}: ${hasOrders ? "anonimleştirilecek" : "silinecek"} (role=${u.role}, siparis=${u._count.orders})`
      );
    }
  }

  if (!apply) {
    console.log("\nUygulamak icin --apply ekle.\n");
  } else {
    console.log("\n✅ Bitti. Email'leri tekrar kullanabilirsin.\n");
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
