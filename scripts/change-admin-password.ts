/**
 * Admin sifresini guvenli sekilde degistirir.
 *
 * Kullanim:
 *   npx tsx scripts/change-admin-password.ts <email> <yeniSifre>
 *
 * Yeni sifre min 12 karakter, harf + rakam icermeli.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const [, , email, newPwd] = process.argv;
  if (!email || !newPwd) {
    console.error("Kullanim: npx tsx scripts/change-admin-password.ts <email> <yeniSifre>");
    process.exit(1);
  }
  if (newPwd.length < 12 || !/[A-Za-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
    console.error("Sifre en az 12 karakter olmali ve hem harf hem rakam icermeli.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Kullanici bulunamadi: ${email}`);
    process.exit(1);
  }
  if (user.role !== "ADMIN") {
    console.error(`Kullanici ADMIN degil (role=${user.role}). Onayli degil.`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPwd, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  console.log(`✓ Admin sifresi guncellendi: ${email}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
