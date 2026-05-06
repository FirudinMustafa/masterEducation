/**
 * Admin login + sipariş onaylama akışını uçtan uca test eder.
 * Kullanıcının "404" hatasını reproduce ediyor mu görelim.
 */
import "dotenv/config";

const BASE = process.env.PROD_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@mastereducation.com.tr";
if (!process.env.ADMIN_PASSWORD) {
  console.error(
    "ADMIN_PASSWORD env zorunlu. Komutu su sekilde calistir:\n" +
      "  ADMIN_PASSWORD=xxx PROD_URL=https://... npx tsx scripts/test-admin-approve-order.ts"
  );
  process.exit(1);
}
const ADMIN_PASSWORD: string = process.env.ADMIN_PASSWORD;

interface CookieJar {
  cookies: Map<string, string>;
}

function captureCookies(jar: CookieJar, res: Response) {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const [name, ...rest] = pair.split("=");
    jar.cookies.set(name.trim(), rest.join("=").trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function main() {
  const jar: CookieJar = { cookies: new Map() };

  console.log("1. CSRF token alınıyor...");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  captureCookies(jar, csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  console.log("   CSRF:", csrfToken.slice(0, 12), "...");
  console.log("   Cookies:", Array.from(jar.cookies.keys()).join(", "));

  console.log("\n2. Admin login (credentials provider)...");
  const loginBody = new URLSearchParams({
    csrfToken,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    callbackUrl: `${BASE}/admin`,
    redirect: "false",
    json: "true",
  });
  const loginRes = await fetch(
    `${BASE}/api/auth/callback/credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader(jar),
      },
      body: loginBody,
      redirect: "manual",
    }
  );
  captureCookies(jar, loginRes);
  console.log("   Status:", loginRes.status);
  const sessionCookie = jar.cookies.get("__Secure-authjs.session-token") ||
    jar.cookies.get("authjs.session-token") ||
    jar.cookies.get("next-auth.session-token") ||
    jar.cookies.get("__Secure-next-auth.session-token");
  console.log("   Session cookie present:", !!sessionCookie);

  if (!sessionCookie) {
    console.log("   Login failed. Cookie keys:", Array.from(jar.cookies.keys()));
    const txt = await loginRes.text().catch(() => "");
    console.log("   Body:", txt.slice(0, 500));
    process.exit(1);
  }

  console.log("\n3. /api/auth/session — kim olarak bağlandık?");
  const sessRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  const sess = await sessRes.json();
  console.log("   Session:", JSON.stringify(sess, null, 2));

  console.log("\n4. Sipariş listesini çek (admin sayfasına HEAD)...");
  const adminRes = await fetch(`${BASE}/admin/siparisler`, {
    headers: { Cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  console.log("   Status:", adminRes.status);

  console.log("\n5. DB'deki sipariş ID'sini al + approve dene...");
  const pg = (await import("pg")).default;
  const c = new pg.Client({
    connectionString:
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  });
  await c.connect();
  const r = await c.query<{ id: string; orderNumber: string; status: string }>(
    `SELECT id, "orderNumber", status FROM orders WHERE status = 'PENDING' LIMIT 1`
  );
  await c.end();
  if (!r.rows[0]) {
    console.log("   PENDING sipariş yok.");
    process.exit(0);
  }
  const order = r.rows[0];
  console.log(`   Hedef sipariş: ${order.orderNumber} (${order.id}) — ${order.status}`);

  console.log("\n6. POST /api/admin/orders/[id]/status → APPROVED");
  const approveRes = await fetch(
    `${BASE}/api/admin/orders/${order.id}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({ status: "APPROVED" }),
    }
  );
  console.log("   Status:", approveRes.status);
  const body = await approveRes.text();
  console.log("   Body:", body.slice(0, 500));

  if (approveRes.status === 200) {
    console.log("\n✅ Onay başarılı — 404 BUG YOK; admin endpoint çalışıyor.");
  } else {
    console.log(`\n❌ Hata kodu: ${approveRes.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
