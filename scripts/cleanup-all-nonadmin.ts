/**
 * VPS'e taşımadan önce temiz başlangıç: ADMIN dışındaki TÜM kullanıcıları
 * (bayiler + müşteriler + anonimleştirilmişler) siler. Cascade ile sipariş/
 * adres/dealer/ledger vb. temizlenir. Sadece role=ADMIN hesaplar kalır.
 *
 * Yalnız bu masterEducation Neon DB'sini etkiler — okultedarigim.com'un
 * ayrı veritabanı vardır, ona DOKUNMAZ.
 *
 * Kullanım:
 *   Önizleme : npx tsx scripts/cleanup-all-nonadmin.ts
 *   Uygula   : npx tsx scripts/cleanup-all-nonadmin.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const APPLY = process.argv.includes("--apply");

(async () => {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  });
  const nonAdmin = await prisma.user.findMany({
    where: { role: { not: "ADMIN" } },
    select: { id: true, email: true, role: true },
  });

  console.log("─".repeat(60));
  console.log(`TEMİZLİK — ${APPLY ? "UYGULAMA" : "DRY-RUN (önizleme)"}`);
  console.log("─".repeat(60));
  console.log(`KORUNACAK admin (${admins.length}): ${admins.map((a) => a.email).join(", ")}`);
  console.log(`SİLİNECEK admin-olmayan (${nonAdmin.length}):`);
  for (const u of nonAdmin) console.log(`  - ${u.email} (${u.role})`);
  console.log("─".repeat(60));

  if (!APPLY) {
    console.log("DRY-RUN — hiçbir şey silinmedi. Uygulamak için: --apply");
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  let deleted = 0;
  const errors: string[] = [];
  for (const u of nonAdmin) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
      deleted++;
    } catch (e) {
      errors.push(`${u.email}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  console.log(`Silinen: ${deleted}`);
  if (errors.length) {
    console.log(`Hatalar (${errors.length}):`);
    for (const e of errors) console.log(`  ! ${e}`);
  }
  const remaining = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(`\nKalan kullanıcılar (${remaining.length}):`);
  for (const u of remaining) console.log(`  • ${u.email} (${u.role})`);

  await prisma.$disconnect();
  await pool.end();
})();
