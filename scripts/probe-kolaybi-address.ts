/**
 * KolayBi: contact (adressiz) oluştur → /address/create varyantları dene.
 * "Ülke eşleşmiyor" hatasını hangi alan geçiriyor bul (country_id? country?).
 */
const BASE = process.env.KOLAYBI_BASE_URL || "https://ofis-sandbox-api.kolaybi.com";
const API_KEY = process.env.KOLAYBI_API_KEY!;
const CHANNEL = process.env.KOLAYBI_CHANNEL!;

async function token(): Promise<string> {
  const res = await fetch(`${BASE}/kolaybi/v1/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", Channel: CHANNEL },
    body: JSON.stringify({ api_key: API_KEY }),
  });
  return ((await res.json()) as { data: string }).data;
}

async function post(path: string, tok: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${tok}`, Channel: CHANNEL },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, body: parsed as { code?: number; message?: string; data?: Record<string, unknown> } };
}

async function makeContact(tok: string): Promise<number> {
  const ts = Date.now();
  const r = await post("/kolaybi/v1/associates", tok, {
    name: `AddrProbe ${ts}`, surname: ".", identity_no: "1234567890",
    is_corporate: true, tax_office: "Kadıköy", email: `addrprobe-${ts}@test.com`,
  });
  return r.body.data!.id as number;
}

async function tryAddr(label: string, tok: string, extra: Record<string, unknown>) {
  const associate_id = await makeContact(tok);
  const body = { associate_id, address: "Test cd 5", city: "İstanbul", district: "Kadıköy", address_type: "invoice", postal_code: "34710", ...extra };
  const r = await post("/kolaybi/v1/address/create", tok, body);
  const ok = r.status >= 200 && r.status < 300;
  console.log(`\n[${label}] status=${r.status} ok=${ok}`);
  console.log("  msg:", r.body?.message ?? "(yok)", "code:", r.body?.code ?? "(yok)");
  if (ok) console.log("  → data:", JSON.stringify(r.body?.data)?.slice(0, 250));
}

(async () => {
  const tok = await token();
  console.log("Token alındı.");
  await tryAddr("country-YOK", tok, {});
  await tryAddr("country=Türkiye", tok, { country: "Türkiye" });
  await tryAddr("country_id=1", tok, { country_id: 1 });
  await tryAddr("country_id=212", tok, { country_id: 212 });
  await tryAddr("is_abroad=false", tok, { is_abroad: false });
  await tryAddr("country=Türkiye+is_abroad=false", tok, { country: "Türkiye", is_abroad: false });
})();
