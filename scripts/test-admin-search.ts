import "dotenv/config";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PWD = "admin123";

async function req(path: string, init?: RequestInit & { cookies?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.cookies) headers["Cookie"] = init.cookies;
  const res = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  return {
    status: res.status,
    text,
    json: (() => { try { return JSON.parse(text); } catch { return null; } })(),
    setCookies: res.headers.getSetCookie(),
  };
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const jar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  const params = new URLSearchParams({
    email: ADMIN_EMAIL,
    password: ADMIN_PWD,
    csrfToken: csrfRes.json?.csrfToken,
    json: "true",
  });
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar },
    body: params.toString(),
    redirect: "manual",
  });
  return [...csrfRes.setCookies, ...loginRes.headers.getSetCookie()]
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("="))
    .join("; ");
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); fail++; }
}

(async () => {
  console.log("\n=== ADMIN SEARCH BAR TESTS ===\n");
  const cookies = await login();

  for (const [label, path, expectContain] of [
    ["Bayiler search", "/admin/bayiler?ara=test", "Bayiler"],
    ["Siparisler search", "/admin/siparisler?ara=ME-", "Siparisler"],
    ["Kategoriler search", "/admin/kategoriler?ara=elt", "Kategoriler"],
    ["Yayinevleri search", "/admin/yayinevleri?ara=express", "Yayinevleri"],
    ["Kuponlar search", "/admin/kuponlar?ara=TEST", "Kuponlar"],
    ["Yorumlar search", "/admin/yorumlar?ara=good", "Yorum"],
    ["Iskontolar search", "/admin/iskontolar?ara=test", "Iskontolar"],
    ["Error-log search", "/admin/error-log?ara=error", "Hata"],
    ["Kullanicilar search", "/admin/kullanicilar?ara=admin", "Kullanicilar"],
    ["Urunler search", "/admin/urunler?ara=english", "Urunler"],
    ["Email-log search", "/admin/email-log?ara=dealer", "Email"],
  ] as const) {
    const r = await req(path, { cookies });
    check(`${label} -> 200`, r.status === 200, `got ${r.status}`);
    if (r.status === 200) {
      check(`${label} sayfa basligi`, r.text.includes(expectContain));
    }
  }

  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
