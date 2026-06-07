/**
 * KolayBi invoice "Ön ek bulunamadı" probe.
 * Prereq (contact + address + product) kurar, sonra fatura POST'unu
 * serial_no varyantlarıyla dener.
 */
const BASE = process.env.KOLAYBI_BASE_URL || "https://ofis-sandbox-api.kolaybi.com";
const API_KEY = process.env.KOLAYBI_API_KEY!;
const CHANNEL = process.env.KOLAYBI_CHANNEL!;

async function token(): Promise<string> {
  const res = await fetch(`${BASE}/kolaybi/v1/access_token`, {
    method: "POST", headers: { "content-type": "application/json", Channel: CHANNEL },
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

(async () => {
  const tok = await token();
  const ts = Date.now();
  const c = await post("/kolaybi/v1/associates", tok, {
    name: `InvProbe ${ts}`, surname: ".", identity_no: "1234567890",
    is_corporate: true, tax_office: "Kadıköy", email: `invprobe-${ts}@test.com`,
  });
  const contact_id = c.body.data!.id as number;
  const a = await post("/kolaybi/v1/address/create", tok, {
    associate_id: contact_id, address: "Test cd 5", city: "İstanbul", district: "Kadıköy",
    country: "Türkiye", address_type: "invoice", postal_code: "34710",
  });
  const address_id = a.body.data!.id as number;
  const p = await post("/kolaybi/v1/products", tok, {
    name: `InvProbe Ürün ${ts}`, code: `IP-${ts}`, vat_rate: 10, price: 150,
    price_currency: "try", sale_price_vat_included: true, product_type: "good",
  });
  const product_id = p.body.data!.id as number;
  console.log(`prereq: contact=${contact_id} address=${address_id} product=${product_id}`);

  const items = [{ product_id, quantity: "2", unit_price: "150", vat_rate: 10, description: "Test" }];

  async function tryInv(label: string, payload: Record<string, unknown>) {
    const r = await post("/kolaybi/v1/invoices", tok, payload);
    const ok = r.status >= 200 && r.status < 300;
    console.log(`\n[${label}] status=${r.status} ok=${ok}`);
    console.log("  msg:", r.body?.message ?? "(yok)", "code:", r.body?.code ?? "(yok)");
    if (ok) console.log("  → data:", JSON.stringify(r.body?.data)?.slice(0, 250));
  }

  const mk = (order_date: string, extra: Record<string, unknown> = {}) => ({
    contact_id, address_id, order_date, currency: "try", items,
    type: "sale_invoice", document_scenario: "TICARIFATURA", document_type: "SATIS",
    receiver_email: "test@test.com", description: "Probe", ...extra,
  });
  // Yıl varyantları — seri yıla bağlı olabilir
  await tryInv("2026 (serial yok)", mk("2026-06-04"));
  await tryInv("2025 (serial yok)", mk("2025-06-04"));
  await tryInv("2024 (serial yok)", mk("2024-06-04"));
  await tryInv("2025 + serial=ME", mk("2025-06-04", { serial_no: "ME" }));
  await tryInv("2026 + serial=ME", mk("2026-06-04", { serial_no: "ME" }));
})();
