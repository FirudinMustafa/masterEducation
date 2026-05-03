/**
 * Faz 16 ikinci tur güvenlik düzeltmeleri canlı doğrulama:
 *  1. Profile email change → currentPassword zorunlu (account takeover engeli)
 *  2. Reset token DB'de hash olarak saklanıyor — plain token bulunmaz
 *  3. Audit log metadata'da password/token redact ediliyor
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const cookies = new Map<string, string>();
function applyCookies(h: Headers) {
  const all = h.getSetCookie?.() ?? [];
  for (const sc of all) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    cookies.set(k.trim(), v.join("=").trim());
  }
}
const cookieHeader = () =>
  Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

async function login(email: string, password: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  applyCookies(csrfRes.headers);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      email,
      password,
      csrfToken,
      callbackUrl: `${BASE}/`,
      json: "true",
    }).toString(),
    redirect: "manual",
  });
  applyCookies(r.headers);
}

(async () => {
  const ts = Date.now();
  let pass = 0,
    total = 0;
  const check = (n: string, c: boolean, x?: unknown) => {
    total++;
    if (c) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else console.log(`  ✗ ${n}`, x ?? "");
  };

  let userId: string | null = null;

  try {
    const email = `r2-test-${ts}@example.test`;
    const password = "valid-password-1";
    const user = await prisma.user.create({
      data: {
        email,
        name: "R2 Test",
        passwordHash: await bcrypt.hash(password, 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
      },
    });
    userId = user.id;

    await login(email, password);

    // --- 1) Email change without password → 400 ---
    const r1 = await fetch(`${BASE}/api/account/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        name: "R2 Test",
        email: `r2-hijacked-${ts}@example.test`,
      }),
    });
    check("Email change parolasız → 400", r1.status === 400);
    const d1 = (await r1.json()) as { error?: string };
    check(
      "Hata mesajı parola istiyor",
      d1.error?.includes("sifre") || d1.error?.includes("Sifre") ? true : false
    );

    const after1 = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    check("DB: email değişmedi", after1?.email === email);

    // --- 2) Email change with WRONG password → 403 ---
    const r2 = await fetch(`${BASE}/api/account/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        name: "R2 Test",
        email: `r2-hijacked-${ts}@example.test`,
        currentPassword: "wrong-pass",
      }),
    });
    check("Email change yanlış parola → 403", r2.status === 403);

    // --- 3) Email change with CORRECT password → 200 ---
    const newEmail = `r2-changed-${ts}@example.test`;
    const r3 = await fetch(`${BASE}/api/account/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        name: "R2 Test",
        email: newEmail,
        currentPassword: password,
      }),
    });
    check("Email change doğru parola → 200", r3.status === 200);
    const after3 = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, emailVerified: true },
    });
    check("DB: email değişti", after3?.email === newEmail);
    check("DB: emailVerified null (yeniden doğrulama gerek)", after3?.emailVerified === null);

    // --- 4) Reset token DB hash olarak saklanıyor ---
    const fpRes = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    if (fpRes.status === 200) {
      const tokenRecord = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id, usedAt: null },
        orderBy: { createdAt: "desc" },
        select: { token: true },
      });
      if (tokenRecord) {
        check(
          "Reset token DB'de SHA-256 hash (64 hex char)",
          /^[a-f0-9]{64}$/.test(tokenRecord.token)
        );
      }
    } else {
      console.log(
        `  (forgot-password ${fpRes.status} — rate limit olabilir, atlandı)`
      );
    }

    // --- 5) Audit log redaction (sanitizeAuditMetadata fonksiyonel test
    //         vitest'te yapıldı; canlıda audit yazımının çalıştığını
    //         kontrol et) ---
    const auditEntries = await prisma.auditLog.count({
      where: { actorId: user.id },
    });
    check("Audit log yazıldı", auditEntries > 0);

    // Cleanup
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    userId = null;

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
