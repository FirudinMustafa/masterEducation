/**
 * KolayBi teşhis — "Ön ek bulunamadı" nedenini bulmak için GET sorguları.
 * Şirket(ler), mevcut faturalar ve olası ön ek/seri endpoint'lerini yoklar.
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

async function get(path: string, tok: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${tok}`, Channel: CHANNEL },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body };
}

(async () => {
  const tok = await token();
  const paths = [
    "/kolaybi/v1/companies",
    "/kolaybi/v1/company",
    "/kolaybi/v1/invoices?type=sale_invoice",
    "/kolaybi/v1/invoice-prefixes",
    "/kolaybi/v1/prefixes",
    "/kolaybi/v1/document-prefixes",
    "/kolaybi/v1/e-document/prefixes",
    "/kolaybi/v1/e-documents/prefixes",
    "/kolaybi/v1/settings/prefixes",
    "/kolaybi/v1/e-invoice/prefixes",
    "/kolaybi/v1/serial-numbers",
    "/kolaybi/v1/series",
  ];
  for (const p of paths) {
    try {
      const r = await get(p, tok);
      const s = JSON.stringify(r.body);
      console.log(`\nGET ${p} → ${r.status}`);
      console.log("  " + (s.length > 500 ? s.slice(0, 500) + "…" : s));
    } catch (e) {
      console.log(`\nGET ${p} → ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }
})();
