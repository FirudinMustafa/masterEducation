/**
 * QA fixture test bayilerini siler (qa-fixture-*@qa.local).
 * Cascade ile sipariş/adres/ledger/iskonto/dealer kayıtları temizlenir.
 * Gerçek bayilere (Master, Firudin vb.) dokunmaz.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TARGETS = [
  "qa-fixture-approved@qa.local",
  "qa-fixture-pending@qa.local",
  "qa-fixture-rejected@qa.local",
  "qa-fixture-suspended@qa.local",
  "qa-fixture-customer@qa.local",
];

(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: TARGETS } },
    select: { id: true, email: true, role: true },
  });
  console.log(`Bulunan QA fixture hesabı: ${users.length}`);
  let deleted = 0;
  const errors: string[] = [];
  for (const u of users) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
      console.log(`Silindi: ${u.email} (${u.role})`);
      deleted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      errors.push(`${u.email}: ${msg}`);
    }
  }
  console.log(`\nToplam silinen: ${deleted}`);
  if (errors.length) {
    console.log(`Hatalar (${errors.length}):`);
    for (const e of errors) console.log(`  ! ${e}`);
  }
  await prisma.$disconnect();
  await pool.end();
})();
