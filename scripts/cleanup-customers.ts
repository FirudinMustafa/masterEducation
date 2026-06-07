/**
 * Bayi-only dönüşümü — mevcut MÜŞTERİ (role=CUSTOMER) hesaplarını temizler.
 *
 * Güvenli ve muhasebe-uyumlu strateji:
 *   - Siparişi OLMAYAN müşteriler → hard delete (cascade ile adres/sepet/yorum).
 *   - Siparişi OLAN müşteriler → anonimleştir (PII silinir, sipariş kayıtları
 *     Vergi Usul Kanunu gereği korunur). Giriş zaten engelli (auth guard).
 *
 * Kullanım:
 *   DRY-RUN (varsayılan, hiçbir şey değiştirmez):
 *     npx tsx scripts/cleanup-customers.ts
 *   UYGULA (geri alınamaz):
 *     npx tsx scripts/cleanup-customers.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const APPLY = process.argv.includes("--apply");

async function main() {
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    select: { id: true, email: true, _count: { select: { orders: true } } },
  });

  const withOrders = customers.filter((c) => c._count.orders > 0);
  const withoutOrders = customers.filter((c) => c._count.orders === 0);

  console.log("─".repeat(60));
  console.log(`MÜŞTERİ TEMİZLİĞİ — ${APPLY ? "UYGULAMA MODU" : "DRY-RUN (önizleme)"}`);
  console.log("─".repeat(60));
  console.log(`Toplam CUSTOMER hesabı : ${customers.length}`);
  console.log(`  • Siparişi olmayan    : ${withoutOrders.length}  → HARD DELETE`);
  console.log(`  • Siparişi olan       : ${withOrders.length}  → ANONİMLEŞTİR (sipariş korunur)`);
  console.log("─".repeat(60));

  if (!APPLY) {
    console.log("DRY-RUN — hiçbir değişiklik yapılmadı. Uygulamak için: --apply");
    return;
  }

  let deleted = 0;
  let deleteFailed = 0;
  for (const c of withoutOrders) {
    try {
      await prisma.user.delete({ where: { id: c.id } });
      deleted++;
    } catch (e) {
      deleteFailed++;
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      console.warn(`  ! Silinemedi ${c.email}: ${msg}`);
    }
  }

  let anonymized = 0;
  for (const c of withOrders) {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: c.id },
        data: {
          email: `deleted-${c.id}@example.invalid`,
          name: "Silinmiş Müşteri",
          phone: null,
          passwordHash: "DELETED_NO_LOGIN",
          marketingConsent: false,
          marketingConsentAt: null,
        },
      });
      // Adres PII'sını temizle (sipariş snapshot'ları shippingName'de kalır).
      await tx.address.updateMany({
        where: { userId: c.id },
        data: { fullName: "Silinmiş Müşteri", phone: "" },
      });
    });
    anonymized++;
  }

  console.log(`Silinen (siparişsiz)  : ${deleted}${deleteFailed ? ` (başarısız: ${deleteFailed})` : ""}`);
  console.log(`Anonimleştirilen      : ${anonymized}`);
  console.log("Tamamlandı.");
}

main()
  .catch((e) => {
    console.error("HATA:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
