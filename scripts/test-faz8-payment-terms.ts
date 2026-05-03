/**
 * Faz 8 dogrulama: Bayi paymentTerms (PREPAID/OPEN_ACCOUNT) end-to-end.
 *
 *  1. PREPAID + APPROVED bir test bayisi olustur
 *  2. NextAuth credentials login → session cookie al
 *  3. POST /api/orders paymentMethod=OPEN_ACCOUNT  → 403 PREPAID_DEALER...
 *  4. POST /api/dealer/bulk-order/submit            → 403 PREPAID_DEALER_BULK...
 *  5. GET  /bayi/ekstre                              → 307 redirect
 *  6. Cleanup
 *
 * Login icin NextAuth's CSRF + credentials callback kullanilir.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface CookieJar {
  cookies: Map<string, string>;
}
const newJar = (): CookieJar => ({ cookies: new Map() });

function applySetCookie(jar: CookieJar, headers: Headers) {
  const all = headers.getSetCookie?.() ?? [];
  for (const sc of all) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    jar.cookies.set(k.trim(), v.join("=").trim());
  }
}

function jarHeader(jar: CookieJar): string {
  return Array.from(jar.cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchJ(jar: CookieJar, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: jarHeader(jar),
    },
    redirect: "manual",
  });
  applySetCookie(jar, res.headers);
  return res;
}

async function login(jar: CookieJar, email: string, password: string) {
  // 1. CSRF token
  const csrfRes = await fetchJ(jar, `${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  // 2. Credentials callback
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE}/`,
    json: "true",
  });
  const r = await fetchJ(jar, `${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (r.status >= 400) {
    throw new Error(`login failed: ${r.status}`);
  }
  // 3. Session check
  const s = await fetchJ(jar, `${BASE}/api/auth/session`);
  return (await s.json()) as { user?: { role: string; dealerPaymentTerms?: string } };
}

async function main() {
  const ts = Date.now();
  const email = `faz8-prepaid-${ts}@example.test`;
  const password = "test1234";
  let userId: string | null = null;
  let pass = 0;
  let total = 0;
  const fail = (n: string) => console.log(`  ✗ ${n}`);
  const ok = (n: string) => {
    pass++;
    console.log(`  ✓ ${n}`);
  };
  const check = (n: string, cond: boolean) => {
    total++;
    if (cond) ok(n);
    else fail(n);
  };

  try {
    // PREPAID + APPROVED test bayisi
    const passwordHash = await bcrypt.hash(password, 10);
    const productId = (await prisma.product.findFirst({
      where: { isPublished: true, stockQuantity: { gt: 5 } },
      select: { id: true },
    }))!.id;

    const user = await prisma.user.create({
      data: {
        email,
        name: "Faz8 Prepaid Test",
        passwordHash,
        role: "DEALER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "Ofis",
            fullName: "Faz8 Prepaid Test",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test cadde 1",
            isDefault: true,
          },
        },
        dealer: {
          create: {
            companyName: "Faz8 Prepaid Co",
            taxOffice: "Kadikoy",
            taxNumber: "1234567890",
            status: "APPROVED",
            paymentTerms: "PREPAID",
            creditLimit: 0,
          },
        },
      },
    });
    userId = user.id;
    console.log("[1] PREPAID dealer created:", email);

    // Login
    const jar = newJar();
    const session = await login(jar, email, password);
    check(
      "session.role=DEALER",
      session.user?.role === "DEALER"
    );
    check(
      "session.dealerPaymentTerms=PREPAID",
      session.user?.dealerPaymentTerms === "PREPAID"
    );
    console.log("[2] Logged in. Session paymentTerms:", session.user?.dealerPaymentTerms);

    // POST /api/orders paymentMethod=OPEN_ACCOUNT → 403
    const orderRes = await fetchJ(jar, `${BASE}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ productId, quantity: 1 }],
        shipping: {
          fullName: "Faz8 Prepaid Test",
          email,
          phone: "05551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cadde 1",
        },
        paymentMethod: "OPEN_ACCOUNT",
      }),
    });
    const orderJson = (await orderRes.json()) as { error?: string; code?: string };
    check("orders OPEN_ACCOUNT → 403", orderRes.status === 403);
    check(
      "orders error code = PREPAID_DEALER_OPEN_ACCOUNT_FORBIDDEN",
      orderJson.code === "PREPAID_DEALER_OPEN_ACCOUNT_FORBIDDEN"
    );

    // POST /api/dealer/bulk-order/submit → 403
    const bulkRes = await fetchJ(jar, `${BASE}/api/dealer/bulk-order/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ productId, quantity: 1 }],
        shipping: {
          fullName: "Faz8 Prepaid",
          phone: "05551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test cadde 1",
        },
      }),
    });
    const bulkJson = (await bulkRes.json()) as { code?: string };
    check("bulk-order → 403", bulkRes.status === 403);
    check(
      "bulk-order code = PREPAID_DEALER_BULK_FORBIDDEN",
      bulkJson.code === "PREPAID_DEALER_BULK_FORBIDDEN"
    );

    // GET /bayi/ekstre → Next 16 streaming context'te 200 + meta-refresh
    // HTML icine NEXT_REDIRECT marker ve http-equiv=refresh meta yerlestirilir.
    // (Browser bunu okuyup yonlendirir.) Body'de bu isaretleri ariyoruz.
    const ekstreRes = await fetchJ(jar, `${BASE}/bayi/ekstre`);
    const ekstreBody = await ekstreRes.text();
    check("/bayi/ekstre body → NEXT_REDIRECT marker", ekstreBody.includes("NEXT_REDIRECT"));
    check(
      "/bayi/ekstre body → meta-refresh /bayi",
      /http-equiv="refresh"[^>]*\/bayi[^>]*"/.test(ekstreBody) ||
        (ekstreBody.includes("NEXT_REDIRECT") && ekstreBody.includes("/bayi"))
    );
    check(
      "/bayi/ekstre body → 'Bekleyen Bakiye' icermez (sayfa render edilmedi)",
      !ekstreBody.includes("Bekleyen Bakiye")
    );

    const tsRes = await fetchJ(jar, `${BASE}/bayi/toplu-siparis`);
    const tsBody = await tsRes.text();
    check("/bayi/toplu-siparis body → NEXT_REDIRECT marker", tsBody.includes("NEXT_REDIRECT"));

    console.log(`\n[3] Result: ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
  } finally {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      console.log("[cleanup] test user deleted");
    }
    await prisma.$disconnect();
    await pool.end();
  }
}
main();
