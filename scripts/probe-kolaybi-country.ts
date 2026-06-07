/**
 * KolayBi associate (contact) create — country alanı format probe'u.
 * Hangi country değeri "Ülke eşleşmiyor" hatasını geçiyor bulur.
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

async function tryCreate(label: string, tok: string, addresses: unknown) {
  const ts = Date.now();
  const body: Record<string, unknown> = {
    name: `Probe ${label} ${ts}`,
    surname: ".",
    identity_no: "1234567890",
    is_corporate: true,
    tax_office: "Kadıköy",
    email: `probe-${ts}@test.com`,
  };
  if (addresses !== undefined) body.addresses = addresses;
  const res = await fetch(`${BASE}/kolaybi/v1/associates`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${tok}`,
      Channel: CHANNEL,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep */ }
  const p = parsed as { code?: number; message?: string; data?: { id?: number; address?: unknown } };
  const ok = res.status >= 200 && res.status < 300;
  console.log(`\n[${label}] status=${res.status} ok=${ok}`);
  console.log("  msg:", p?.message ?? "(yok)", "code:", p?.code ?? "(yok)");
  if (ok) console.log("  → id:", p?.data?.id, "address:", JSON.stringify(p?.data?.address)?.slice(0, 200));
}

(async () => {
  const tok = await token();
  console.log("Token alındı:", tok.slice(0, 20) + "...");

  const baseAddr = { address: "Test cd 5", city: "İstanbul", district: "Kadıköy", address_type: "invoice", postal_code: "34710" };

  await tryCreate("adres-YOK", tok, undefined);
  await tryCreate("country-YOK", tok, [{ ...baseAddr }]);
  await tryCreate("country=Türkiye", tok, [{ ...baseAddr, country: "Türkiye" }]);
  await tryCreate("country=TR", tok, [{ ...baseAddr, country: "TR" }]);
  await tryCreate("country=Turkey", tok, [{ ...baseAddr, country: "Turkey" }]);
})();
