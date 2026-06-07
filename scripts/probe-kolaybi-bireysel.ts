/**
 * KolayBi BİREYSEL fatura — detaylı doğrulama.
 * 1) Bireysel cari + ürün kurar
 * 2) Farklı KDV/iskonto varyasyonlarıyla fatura POST eder
 * 3) Her faturayı GET ile GERİ OKUR → KolayBi'de gerçekten kayıtlı mı + rakamlar doğru mu
 * Amaç: KDV dahil fiyatı doğru yansıtmanın yolunu bulmak ve "panele gidiyor mu" teyidi.
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
async function call(method: string, path: string, tok: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", Authorization: `Bearer ${tok}`, Channel: CHANNEL },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let b: any = t;
  try { b = JSON.parse(t); } catch { /* keep */ }
  return { status: res.status, body: b };
}

(async () => {
  const tok = await token();
  const ts = Date.now();

  // Bireysel cari
  const c = await call("POST", "/kolaybi/v1/associates", tok, {
    name: `Bireysel Test ${ts}`, surname: "Mustafa", identity_no: "11111111110",
    is_corporate: false, email: `bireysel-${ts}@test.com`, phone: "+905355555555",
  });
  const cid = c.body.data?.id;
  const a = await call("POST", "/kolaybi/v1/address/create", tok, {
    associate_id: cid, address: "Test Mah. Test Cd. 5", city: "İstanbul", district: "Kadıköy",
    country: "Türkiye", address_type: "invoice", postal_code: "34710",
  });
  const aid = a.body.data?.id;
  // Ürün: bizim sistemde fiyat KDV DAHİL. price 150, vat 10.
  const p = await call("POST", "/kolaybi/v1/products", tok, {
    name: `Test Kitap ${ts}`, code: `TK-${ts}`, vat_rate: 10, price: 150,
    price_currency: "try", sale_price_vat_included: true, product_type: "good",
  });
  const pid = p.body.data?.id;
  console.log(`prereq: cari=${cid} adres=${aid} ürün=${pid}`);

  async function tryInvoice(label: string, items: unknown[], extra: Record<string, unknown> = {}) {
    const payload = {
      contact_id: cid, address_id: aid, order_date: "2026-06-04", currency: "try",
      type: "sale_invoice", receiver_email: `bireysel-${ts}@test.com`,
      description: `OTOMASYON TEST ${label} ${ts}`, items, ...extra,
    };
    const r = await call("POST", "/kolaybi/v1/invoices", tok, payload);
    console.log(`\n=== [${label}] POST → ${r.status}`);
    if (r.status < 200 || r.status >= 300) {
      console.log("  HATA:", JSON.stringify(r.body).slice(0, 200));
      return;
    }
    const docId = r.body.data?.document_id;
    console.log(`  POST grand_total=${r.body.data?.grand_total}  document_id=${docId}`);
    // GERİ OKU
    const d = await call("GET", `/kolaybi/v1/invoices/${docId}`, tok);
    const dd = d.body?.data;
    console.log(`  GET → status=${d.status}  KolayBi'de kayıtlı: ${dd ? "EVET" : "HAYIR"}`);
    if (dd) {
      console.log(`  → subtotal=${dd.subtotal} total_vat=${dd.total_vat} grand_total=${dd.grand_total}`);
      console.log(`  → no=${dd.no} serial_no=${dd.serial_no} e_document_status=${dd.e_document_status ?? "(yok)"}`);
      for (const ln of dd.lines ?? []) {
        console.log(`     satır: ${ln.product_name} adet=${ln.quantity} birim=${ln.unit_price} iskonto=${ln.discount_amount} kdv=${ln.vat_amount} satır_top=${ln.grand_total ?? ln.total}`);
      }
    }
  }

  const item = (extra: Record<string, unknown> = {}) => ({
    product_id: pid, quantity: "2", unit_price: "150", vat_rate: 10, description: "Test Kitap", ...extra,
  });

  // 1) Bizim mevcut kodun gönderdiği gibi: unit_price=150 (KDV dahil bizde), vat=10
  await tryInvoice("A-mevcut(150,vat10)", [item()]);
  // 2) Satırda KDV dahil bayrağı dene
  await tryInvoice("B-vat_included", [item({ vat_included: true })]);
  // 3) Alternatif bayrak adı
  await tryInvoice("C-sale_price_vat_included", [item({ sale_price_vat_included: true })]);
  // 4) KDV hariç taban fiyat gönder (150/1.10=136.3636) → grand 300 bekleriz
  await tryInvoice("D-taban(136.36)", [{ product_id: pid, quantity: "2", unit_price: "136.3636", vat_rate: 10, description: "Test Kitap" }]);
  // 5) İskontolu (discount_amount) + 2 kalem
  await tryInvoice("E-iskontolu", [
    item({ discount_amount: "30" }),
    { product_id: pid, quantity: "1", unit_price: "150", vat_rate: 10, description: "Test Kitap 2" },
  ]);
})();
