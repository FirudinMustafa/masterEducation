/**
 * KolayBi doğrulama — gerçekçi sipariş → fatura. Bizim KDV-dahil fiyat modelimizi
 * KolayBi'nin KDV-hariç modeline çevirip toplamların BİREBİR tuttuğunu kanıtlar.
 * Kupon (subtotal_discount_amount) davranışını da ölçer.
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
async function call(method: string, path: string, tok: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { "content-type": "application/json", Authorization: `Bearer ${tok}`, Channel: CHANNEL },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text(); let b: any = t; try { b = JSON.parse(t); } catch {}
  return { status: res.status, body: b };
}
const exVat = (inclVat: number, vat: number) => Math.round((inclVat / (1 + vat / 100)) * 10000) / 10000;

(async () => {
  const tok = await token(); const ts = Date.now();
  const c = await call("POST", "/kolaybi/v1/associates", tok, { name: `Doğrulama ${ts}`, surname: "Test", identity_no: "11111111110", is_corporate: false, email: `dog-${ts}@test.com` });
  const cid = c.body.data?.id;
  const a = await call("POST", "/kolaybi/v1/address/create", tok, { associate_id: cid, address: "Test Cd 5", city: "İstanbul", district: "Kadıköy", country: "Türkiye", address_type: "invoice", postal_code: "34710" });
  const aid = a.body.data?.id;
  const p1 = await call("POST", "/kolaybi/v1/products", tok, { name: `Kitap A ${ts}`, code: `A-${ts}`, vat_rate: 10, price: 200, price_currency: "try", sale_price_vat_included: true, product_type: "good" });
  const p2 = await call("POST", "/kolaybi/v1/products", tok, { name: `Kitap B ${ts}`, code: `B-${ts}`, vat_rate: 10, price: 150, price_currency: "try", sale_price_vat_included: true, product_type: "good" });
  const pid1 = p1.body.data?.id, pid2 = p2.body.data?.id;

  // Gerçekçi sipariş: A=200 KDV-dahil, %20 iskonto → birim 160 (KDV-dahil), 3 adet → 480
  //                   B=150 KDV-dahil, iskonto yok → 150, 2 adet → 300
  // netSubtotal (KDV dahil) = 780. Kargo 0 (bayi). Beklenen order.total = 780.
  const beklenen = 780;
  const items = [
    { product_id: pid1, quantity: "3", unit_price: String(exVat(160, 10)), vat_rate: 10, description: "Kitap A" },
    { product_id: pid2, quantity: "2", unit_price: String(exVat(150, 10)), vat_rate: 10, description: "Kitap B" },
  ];

  async function inv(label: string, extra: Record<string, unknown>, bekle: number) {
    const r = await call("POST", "/kolaybi/v1/invoices", tok, {
      contact_id: cid, address_id: aid, order_date: "2026-06-04", currency: "try",
      type: "sale_invoice", description: `DOĞRULAMA ${label} ${ts}`, items, ...extra,
    });
    const docId = r.body.data?.document_id;
    const d = await call("GET", `/kolaybi/v1/invoices/${docId}`, tok);
    const dd = d.body?.data;
    const g = dd?.grand_total;
    const ok = Math.abs(Number(g) - bekle) < 0.02 ? "✅ TUTUYOR" : `❌ FARK (beklenen ${bekle})`;
    console.log(`\n[${label}] POST=${r.status} doc=${docId}`);
    console.log(`  grand_total=${g} | beklenen=${bekle} → ${ok}`);
    console.log(`  subtotal=${dd?.subtotal} total_vat=${dd?.total_vat}`);
  }

  // 1) Kuponsuz — beklenen 780
  await inv("kuponsuz", {}, beklenen);
  // 2) Kupon 80 TL (KDV dahil) → subtotal_discount_amount olarak gönder, beklenen 700
  await inv("kupon80 (dahil)", { subtotal_discount_amount: 80 }, 700);
  // 3) Kupon 80'i KDV hariç gönderirsek ne olur (kıyas)
  await inv("kupon72.73 (hariç)", { subtotal_discount_amount: exVat(80, 10) }, 700);
})();
