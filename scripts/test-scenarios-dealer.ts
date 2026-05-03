/**
 * BAYI SENARYOLARI — basvurudan APPROVED sipariş verme + ekstre, belge, toplu siparişe kadar.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BASE = "http://localhost:3000";

const DEALER_EMAIL = "scenario-dealer@mastereducation.com.tr";
const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PWD = "admin123";

let pass = 0, fail = 0;
const issues: string[] = [];
function check(name: string, cond: boolean, note?: string) {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${note ? "  " + note : ""}`); fail++; issues.push(`DEALER: ${name} ${note ?? ""}`); }
}

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: DEALER_EMAIL } });
  if (!u) return;
  const d = await prisma.dealer.findUnique({ where: { userId: u.id } });
  if (d) {
    await prisma.dealerDocument.deleteMany({ where: { dealerId: d.id } });
    await prisma.dealerLedger.deleteMany({ where: { dealerId: d.id } });
    await prisma.dealerDiscount.deleteMany({ where: { dealerId: d.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: d.id } });
  }
  const orders = await prisma.order.findMany({ where: { userId: u.id } });
  for (const o of orders) {
    await prisma.auditLog.deleteMany({ where: { entityId: o.id } });
    await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
  await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
  await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
  await prisma.address.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

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

async function login(email: string, password: string) {
  const csrfRes = await req("/api/auth/csrf");
  const csrfToken = csrfRes.json?.csrfToken;
  const jar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  const params = new URLSearchParams({ email, password, csrfToken, json: "true" });
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

(async () => {
  console.log("\n=== DEALER SCENARIOS ===\n");
  await cleanup();
  await req("/api/dev-test/reset-rate-limit", { method: "POST" });

  // ========= BOLUM A: BASVURU =========
  console.log("\n── A) Bayi basvurusu ──");
  const apply = await req("/api/dealer/apply", {
    method: "POST",
    body: JSON.stringify({
      name: "Dealer Scenario",
      email: DEALER_EMAIL,
      phone: "05551234567",
      password: "DealerPass123",
      companyName: "Test Dealer Ltd",
      taxOffice: "Kadikoy",
      taxNumber: "1234567890",
      city: "Istanbul",
      district: "Kadikoy",
      addressLine: "Test sok 1",
    }),
  });
  check(`Bayi basvuru -> 201`, apply.status === 201, `got ${apply.status} ${apply.text.slice(0,200)}`);
  const dealerUser = await prisma.user.findUnique({
    where: { email: DEALER_EMAIL },
    include: { dealer: true },
  });
  check(`User + Dealer kaydi olustu`, !!dealerUser?.dealer);
  check(`Dealer PENDING`, dealerUser?.dealer?.status === "PENDING");

  // Ayni email ile ikinci basvuru -> 409
  const dupApply = await req("/api/dealer/apply", {
    method: "POST",
    body: JSON.stringify({
      name: "Dup",
      email: DEALER_EMAIL,
      phone: "05551234568",
      password: "DealerPass123",
      companyName: "Test Dealer Ltd 2",
      taxOffice: "Besiktas",
      taxNumber: "9876543210",
      city: "Istanbul",
      district: "Besiktas",
      addressLine: "Y sok 2",
    }),
  });
  check(`Ayni email ile dup basvuru -> 409`, dupApply.status === 409, `got ${dupApply.status}`);

  // ========= BOLUM B: PENDING BAYI AKISI =========
  console.log("\n── B) PENDING bayi giris + erisim ──");
  let dealerCookies = await login(DEALER_EMAIL, "DealerPass123");
  check(`Bayi login OK`, dealerCookies.length > 0);

  // /bayi -> redirect veya pending mesaji
  const bayiHome = await req("/bayi", { cookies: dealerCookies });
  check(`PENDING bayi /bayi'de PENDING mesaji goruyor`,
    bayiHome.status === 200 && bayiHome.text.includes("Inceleniyor"),
    `status=${bayiHome.status}`);

  // /bayi/belgeler PENDING'te erisilebilir
  const bayiBelgeler = await req("/bayi/belgeler", { cookies: dealerCookies });
  check(`PENDING bayi /bayi/belgeler -> 200`, bayiBelgeler.status === 200, `got ${bayiBelgeler.status}`);

  // /bayi/ekstre PENDING'te engellenmeli
  const bayiEkstre = await req("/bayi/ekstre", { cookies: dealerCookies });
  check(`PENDING bayi /bayi/ekstre'yi gormuyor (PENDING ekrani dondurur)`,
    bayiEkstre.status === 200 && bayiEkstre.text.includes("Inceleniyor"));

  // Belge yukle — gecerli PDF magic bytes
  const fd = new FormData();
  const pdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, ...new Array(500).fill(0x20)]);
  fd.append("kind", "TAX_CERTIFICATE");
  fd.append("file", new File([pdfBuffer], "vergi.pdf", { type: "application/pdf" }));
  const uploadRes = await fetch(BASE + "/api/dealer/documents", {
    method: "POST",
    headers: { Cookie: dealerCookies },
    body: fd,
  });
  check(`PDF upload (valid magic) -> 200`, uploadRes.status === 200, `got ${uploadRes.status}`);

  // MIME spoofing: EXE bytes with PDF MIME
  const fd2 = new FormData();
  const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0, ...new Array(500).fill(0)]);
  fd2.append("kind", "OTHER");
  fd2.append("file", new File([exeBytes], "malware.pdf", { type: "application/pdf" }));
  const spoof = await fetch(BASE + "/api/dealer/documents", {
    method: "POST",
    headers: { Cookie: dealerCookies },
    body: fd2,
  });
  check(`MIME spoof EXE as PDF -> reddedilir`, spoof.status === 400, `got ${spoof.status}`);

  // ========= BOLUM C: ADMIN APPROVE =========
  console.log("\n── C) Admin bayiyi onayliyor ──");
  const adminCookies = await login(ADMIN_EMAIL, ADMIN_PWD);
  check(`Admin login`, adminCookies.length > 0);

  const dealerId = dealerUser?.dealer?.id;
  if (!dealerId) {
    console.log("  ✗ Dealer id yok, test durdu");
    await cleanup();
    process.exit(1);
  }

  // Belge incele / APPROVE
  const docs = await prisma.dealerDocument.findMany({ where: { dealerId } });
  check(`Bayinin belgesi DB'de`, docs.length >= 1);
  if (docs[0]) {
    const review = await req(`/api/admin/dealers/${dealerId}/documents/${docs[0].id}`, {
      method: "PATCH",
      cookies: adminCookies,
      body: JSON.stringify({ status: "APPROVED" }),
    });
    check(`Admin belge APPROVE -> 200`, review.status === 200, `got ${review.status}`);
  }

  // Bayiyi APPROVE
  const approveDealer = await req(`/api/admin/dealers/${dealerId}/approve`, {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({ creditLimit: 5000, notes: null }),
  });
  check(`Admin bayi APPROVE -> 200`, approveDealer.status === 200, `got ${approveDealer.status} ${approveDealer.text.slice(0, 200)}`);

  const dealerAfter = await prisma.dealer.findUnique({ where: { id: dealerId } });
  check(`Dealer APPROVED`, dealerAfter?.status === "APPROVED");
  check(`Credit limit 5000`, Number(dealerAfter?.creditLimit) === 5000);

  // Admin discount ekle
  const discount = await req("/api/admin/discounts", {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({
      dealerId,
      scope: "GLOBAL",
      discountPct: 20,
    }),
  });
  check(`Admin global iskonto -> 200/201`, [200, 201].includes(discount.status), `got ${discount.status}`);

  // ========= BOLUM D: APPROVED BAYI AKIS =========
  console.log("\n── D) APPROVED bayi akisi ──");
  // Yeni session lazim (dealerStatus JWT degisti)
  dealerCookies = await login(DEALER_EMAIL, "DealerPass123");

  // /bayi (dashboard)
  const dash = await req("/bayi", { cookies: dealerCookies });
  check(`APPROVED bayi dashboard -> 200`, dash.status === 200);
  check(`Dashboard 'Hos geldiniz' gosterilir`, dash.text.includes("Hos geldiniz") || dash.text.includes("hosgeldiniz") || dash.text.includes("Bayi Paneli"));

  // Iskontolarim
  const iskontolar = await req("/bayi/iskontolar", { cookies: dealerCookies });
  check(`/bayi/iskontolar -> 200`, iskontolar.status === 200);

  // Ekstre (XLSX)
  const ekstre = await req("/api/dealer/statement?format=xlsx", { cookies: dealerCookies });
  check(`Ekstre XLSX -> 200`, ekstre.status === 200);
  check(`Ekstre response-type xlsx`, ekstre.text.length > 1000); // binary file

  // Ekstre (CSV)
  const ekstreCsv = await req("/api/dealer/statement?format=csv", { cookies: dealerCookies });
  check(`Ekstre CSV -> 200`, ekstreCsv.status === 200);

  // Toplu siparis template
  const bulkTemplate = await req("/api/dealer/bulk-order/template", { cookies: dealerCookies });
  check(`Bulk template -> 200`, bulkTemplate.status === 200);

  // ========= BOLUM E: BAYI SIPARISI (OPEN_ACCOUNT) =========
  console.log("\n── E) Bayi siparisi (OPEN_ACCOUNT) ──");
  const buyable = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 5 }, price: { gt: 10, lt: 1000 } },
  });
  if (!buyable) {
    check(`Test urunu var`, false);
    await cleanup();
    process.exit(1);
  }

  const oaOrder = await req("/api/orders", {
    method: "POST",
    cookies: dealerCookies,
    body: JSON.stringify({
      items: [{ productId: buyable.id, quantity: 2 }],
      shipping: {
        fullName: "Dealer Scenario",
        email: DEALER_EMAIL,
        phone: "05551234567",
        city: "Istanbul",
        district: "Kadikoy",
        postalCode: "34710",
        address: "Test sok 1",
      },
      paymentMethod: "OPEN_ACCOUNT",
    }),
  });
  check(`Bayi OPEN_ACCOUNT siparis -> 200`, oaOrder.status === 200, `got ${oaOrder.status} ${oaOrder.text.slice(0, 200)}`);

  // Limit asan siparis
  const bigOrder = await req("/api/orders", {
    method: "POST",
    cookies: dealerCookies,
    body: JSON.stringify({
      items: [{ productId: buyable.id, quantity: 1000 }],
      shipping: {
        fullName: "Dealer",
        email: DEALER_EMAIL,
        phone: "0555",
        city: "Istanbul",
        district: "K",
        postalCode: "1",
        address: "X",
      },
      paymentMethod: "OPEN_ACCOUNT",
    }),
  });
  check(`Limit asan siparis -> 400`, bigOrder.status === 400, `got ${bigOrder.status}`);

  // Ledger'da kayit var mi?
  const ledger = await prisma.dealerLedger.findMany({ where: { dealerId } });
  check(`Ledger'da debit kaydi var`, ledger.length >= 1);

  // ========= BOLUM F: TOPLU SIPARIS =========
  console.log("\n── F) Toplu siparis Excel parse ──");
  // Template indirelim, ayni buffer'i geri yollayalim
  const tplBuffer = await (await fetch(BASE + "/api/dealer/bulk-order/template", {
    headers: { Cookie: dealerCookies },
  })).arrayBuffer();
  check(`Template buffer > 5KB`, tplBuffer.byteLength > 5000, `got ${tplBuffer.byteLength}`);

  // ========= BOLUM G: ADMIN SUSPEND BAYI =========
  console.log("\n── G) Admin SUSPEND bayi ──");
  const suspend = await req(`/api/admin/dealers/${dealerId}/suspend`, {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({ notes: "Test askiya alma" }),
  });
  check(`Admin suspend -> 200`, suspend.status === 200, `got ${suspend.status}`);

  // Yeni session ile login (JWT dealerStatus degisti)
  dealerCookies = await login(DEALER_EMAIL, "DealerPass123");

  // Suspended bayi siparis veremiyor — gecerli shipping data ile test et
  const suspendedOrder = await req("/api/orders", {
    method: "POST",
    cookies: dealerCookies,
    body: JSON.stringify({
      items: [{ productId: buyable.id, quantity: 1 }],
      shipping: {
        fullName: "Suspended User",
        email: DEALER_EMAIL,
        phone: "05551234567",
        city: "Istanbul",
        district: "Kadikoy",
        postalCode: "34710",
        address: "Test sok 1",
      },
      paymentMethod: "OPEN_ACCOUNT",
    }),
  });
  check(`SUSPENDED bayi OPEN_ACCOUNT siparis -> 403`, suspendedOrder.status === 403, `got ${suspendedOrder.status} ${suspendedOrder.text.slice(0, 150)}`);

  // Suspended bayi /bayi'yi gormuyor
  const suspDash = await req("/bayi", { cookies: dealerCookies });
  const hasSuspendedText =
    suspDash.text.includes("Askiya") ||
    suspDash.text.includes("askiya") ||
    suspDash.text.includes("suspended");
  check(`SUSPENDED /bayi -> engellendi`,
    suspDash.status === 200 && hasSuspendedText,
    `status=${suspDash.status}, snippet="${suspDash.text.slice(0, 100).replace(/\s+/g, " ")}"`);

  // Bolum H: Bayi red akisi - farkli bayi olustur, REJECT et, neden gorur
  console.log("\n── H) REJECTED bayi red sebebi gorur ──");
  // Ayni bayiyi REJECT et (SUSPENDED -> reject yapabilir miyiz?)
  const reject = await req(`/api/admin/dealers/${dealerId}/reject`, {
    method: "POST",
    cookies: adminCookies,
    body: JSON.stringify({ rejectionReason: "Test red sebebi — otomasyonlu" }),
  });
  check(`Admin reject (SUSPENDED'dan) -> 200`, reject.status === 200, `got ${reject.status}`);

  // Dogrula: dealer.rejectionReason set oldu mu?
  const rejDealer = await prisma.dealer.findUnique({ where: { id: dealerId! } });
  check(`rejectionReason DB'de kaydedildi`, rejDealer?.rejectionReason?.includes("otomasyonlu") ?? false,
    `got: ${rejDealer?.rejectionReason ?? "null"}`);

  dealerCookies = await login(DEALER_EMAIL, "DealerPass123");
  const rejDash = await req("/bayi", { cookies: dealerCookies });
  check(`REJECTED /bayi 200`, rejDash.status === 200, `got ${rejDash.status}`);
  check(`REJECTED /bayi 'Reddedildi' geciyor`,
    rejDash.text.includes("Reddedildi"),
    `snippet="${rejDash.text.slice(0, 200).replace(/\s+/g, " ")}"`);
  check(`REJECTED /bayi sebebi 'otomasyonlu' geciyor`,
    rejDash.text.includes("otomasyonlu"),
    `tam body sebep-check: ${rejDash.text.length > 0 ? "dolu" : "bos"}`);

  // ========= RAPOR =========
  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  if (fail > 0) {
    console.log("Sorunlar:");
    issues.forEach((i) => console.log(`  - ${i}`));
  }
  await cleanup();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
