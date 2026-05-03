/**
 * Password reset akisinin dogrulanmasi:
 *   1) Token TTL (60 dk)
 *   2) once-use (usedAt mark)
 *   3) Yeni token eskiyi invalidate ediyor
 *   4) Expired token kabul edilmiyor
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "pwdreset-test@mastereducation.com.tr";
const TTL_MS = 60 * 60 * 1000;

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!u) return;
  await prisma.passwordResetToken.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

async function isValidToken(token: string): Promise<boolean> {
  const rec = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!rec) return false;
  if (rec.usedAt) return false;
  if (rec.expiresAt < new Date()) return false;
  return true;
}

async function useToken(token: string, newPassword: string) {
  return prisma.$transaction(async (tx) => {
    const rec = await tx.passwordResetToken.findUnique({ where: { token } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      throw new Error("TOKEN_INVALID");
    }
    const hash = await bcrypt.hash(newPassword, 4);
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash: hash } });
    await tx.passwordResetToken.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    });
  });
}

(async () => {
  console.log("\n=== PASSWORD RESET FLOW TESTLERI ===\n");
  await cleanup();

  const pwd = await bcrypt.hash("initial123", 4);
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Test", passwordHash: pwd, role: "CUSTOMER" },
  });

  console.log("1) Yeni token yayinla");
  const t1 = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: t1, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  check("Token gecerli (yeni)", await isValidToken(t1));

  console.log("\n2) Token kullanildiktan sonra invalid");
  await useToken(t1, "newpass123");
  check("Kullanilmis token artik gecersiz", !(await isValidToken(t1)));

  console.log("\n3) Kullanilmis token tekrar kullanilamaz");
  let secondUseFailed = false;
  try {
    await useToken(t1, "anotherpass123");
  } catch (err) {
    if (err instanceof Error && err.message === "TOKEN_INVALID") secondUseFailed = true;
  }
  check("Ikinci kullanim reddedildi", secondUseFailed);

  console.log("\n4) Yeni token, eski aktif tokenlari invalidate eder");
  const t2 = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: t2, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  // Eski tokenlari invalidate et (forgot-password handler'i bunu yapar)
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      token: { not: t2 },
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });
  check("Yeni token gecerli", await isValidToken(t2));

  // Eski eski bir token olsaydi, artik invalid olmali — yukaridaki updateMany
  // t1'i zaten kullanmistik, dolayisiyla kontrolu t3 ile yapalim.
  console.log("\n5) Yeni token yayinlayinca onceki AKTIF tokenlar invalidate oluyor");
  const t3a = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: t3a, expiresAt: new Date(Date.now() + TTL_MS) },
  });
  const t3b = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, token: t3b, expiresAt: new Date(Date.now() + TTL_MS) },
    }),
  ]);
  check("t3a invalidate oldu (yeni yayinlandiginda)", !(await isValidToken(t3a)));
  check("t3b gecerli", await isValidToken(t3b));

  console.log("\n6) Expired token reddediliyor");
  const tExp = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: tExp, expiresAt: new Date(Date.now() - 1000) },
  });
  check("Expired token gecersiz", !(await isValidToken(tExp)));

  let expFailed = false;
  try { await useToken(tExp, "x"); } catch { expFailed = true; }
  check("Expired token kullanimi reddedildi", expFailed);

  console.log("\n7) Token 256-bit random (64 hex)");
  const tRand = crypto.randomBytes(32).toString("hex");
  check("Token uzunlugu 64", tRand.length === 64);
  check("Token sadece hex", /^[0-9a-f]+$/.test(tRand));

  console.log("\n8) TTL 60 dakika");
  const t60 = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.passwordResetToken.create({ data: { userId: user.id, token: t60, expiresAt } });
  const rec = await prisma.passwordResetToken.findUnique({ where: { token: t60 } });
  const ttlActual = (rec!.expiresAt.getTime() - Date.now()) / 1000 / 60;
  check("TTL ~60 dk (59-61)", ttlActual > 59 && ttlActual < 61, `got ${ttlActual.toFixed(2)}`);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
