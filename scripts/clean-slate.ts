/**
 * VPS öncesi temiz başlangıç. Sadece admin kalır.
 * Siler: tüm sipariş & ilişkili kayıtlar, bayi kayıtları, admin-olmayan kullanıcılar.
 * KORUR: ürün/kategori/yayınevi/kupon TANIMLARI ve admin hesabı.
 *
 * Yalnız masterEducation Neon DB'sini etkiler — okultedarigim.com'a DOKUNMAZ
 * (ayrı veritabanı).
 *
 *   Önizleme: npx tsx scripts/clean-slate.ts
 *   Uygula  : npx tsx scripts/clean-slate.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const APPLY = process.argv.includes("--apply");

(async () => {
  const [users, orders, dealers] = await Promise.all([
    prisma.user.count(),
    prisma.order.count(),
    prisma.dealer.count(),
  ]);
  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  console.log("─".repeat(60));
  console.log(`CLEAN SLATE — ${APPLY ? "UYGULAMA" : "DRY-RUN"}`);
  console.log(`Mevcut: kullanıcı=${users} (admin=${admins}), sipariş=${orders}, bayi=${dealers}`);
  console.log(`Sonuç: yalnız ${admins} admin kalacak; sipariş/bayi=0`);
  console.log("─".repeat(60));

  if (!APPLY) {
    console.log("DRY-RUN — değişiklik yok. Uygulamak için: --apply");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  // Çocuk → ebeveyn sırası (FK güvenli)
  const steps: [string, () => Promise<{ count: number }>][] = [
    ["dealerLedger", () => prisma.dealerLedger.deleteMany({})],
    ["invoice", () => prisma.invoice.deleteMany({})],
    ["paymentSession", () => prisma.paymentSession.deleteMany({})],
    ["couponRedemption", () => prisma.couponRedemption.deleteMany({})],
    ["orderEvent", () => prisma.orderEvent.deleteMany({})],
    ["orderItem", () => prisma.orderItem.deleteMany({})],
    ["order", () => prisma.order.deleteMany({})],
    ["dealerDiscount", () => prisma.dealerDiscount.deleteMany({})],
    ["dealerDocument", () => prisma.dealerDocument.deleteMany({})],
    ["dealer", () => prisma.dealer.deleteMany({})],
    ["productReview", () => prisma.productReview.deleteMany({})],
    ["cartItem", () => prisma.cartItem.deleteMany({})],
    ["address", () => prisma.address.deleteMany({ where: { user: { role: { not: "ADMIN" } } } })],
    ["user(non-admin)", () => prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } })],
  ];

  for (const [name, fn] of steps) {
    try {
      const r = await fn();
      console.log(`  ${name}: ${r.count} silindi`);
    } catch (e) {
      console.log(`  ${name}: HATA — ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }

  const remaining = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(`\nKalan kullanıcılar (${remaining.length}):`);
  for (const u of remaining) console.log(`  • ${u.email} (${u.role})`);

  await prisma.$disconnect();
  await pool.end();
})();
