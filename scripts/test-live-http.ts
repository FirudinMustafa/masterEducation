/**
 * Production build uzerinden canli HTTP testleri. `next start` arkada
 * calisirken bu script cagrilabilir. Kritik endpoint'lerin beklenen HTTP
 * statuslerini + sayfalarin icerigindeki temel assertion'lari dogrular.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

(async () => {
  console.log(`\n=== LIVE HTTP TESTS — ${BASE} (NODE_ENV=${process.env.NODE_ENV}) ===\n`);

  console.log("1) Anasayfa");
  const home = await request("/");
  check("200", home.status === 200);
  check("'Master Education' geciyor", home.text.includes("Master Education"));

  console.log("\n2) /urunler listeleme — sadece yayindakiler");
  const list = await request("/urunler");
  check("200", list.status === 200);
  // Markup icinde urun sayisi arayalim: metnin icinde "4687" geciyor mu (yaklasik)
  // Listing client-side filtreleri olabilir, bu yuzden "Toplam" gibi bir anahtar
  // kelime bulunmayabilir. Sadece urun kartlari var mi bakalim.
  check("urun kartlari var (markup'ta product slug linkleri)", list.text.includes("/urunler/"));

  console.log("\n3) Gizli urun detay → 404");
  const hidden = await prisma.product.findFirst({ where: { isPublished: false }, select: { slug: true } });
  if (hidden?.slug) {
    const det = await request(`/urunler/${hidden.slug}`);
    check("404 doner (gizli urun)", det.status === 404, `got ${det.status}`);
  } else {
    console.log("  ⚠ Gizli urun yok, test atlandi");
  }

  console.log("\n4) Yayinda bir urun detay → 200");
  const pub = await prisma.product.findFirst({ where: { isPublished: true }, select: { slug: true, name: true } });
  if (pub?.slug) {
    const det = await request(`/urunler/${pub.slug}`);
    check("200 doner (yayinda urun)", det.status === 200, `got ${det.status}`);
    check("Urun ismi sayfada geciyor", det.text.includes(pub.name));
  }

  console.log("\n5) Sepet sayfasi");
  const cart = await request("/sepet");
  check("200", cart.status === 200);

  console.log("\n6) Sitemap");
  const sm = await request("/sitemap.xml");
  check("200", sm.status === 200);
  const locCount = (sm.text.match(/<loc>/g) || []).length;
  const publishedCount = await prisma.product.count({ where: { isPublished: true } });
  check(`urun sayisi >= yayindakiler (${publishedCount}+)`, locCount >= publishedCount, `loc=${locCount}, published=${publishedCount}`);

  console.log("\n7) Karsilastir sayfasi");
  const compare = await request("/karsilastir");
  check("200", compare.status === 200);

  console.log("\n8) Siparis takip sayfasi");
  const track = await request("/siparis-takip");
  check("200", track.status === 200);

  console.log("\n9) Mock odeme API — PROD'da 403 olmali (guard calisiyor)");
  const mock = await request("/api/payments/mock/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "nothing", action: "success", otp: "123456" }),
  });
  if (process.env.NODE_ENV === "production") {
    check("403 (prod'da kapali)", mock.status === 403, `got ${mock.status}`);
    check("error mesaji net", mock.text.includes("uretimde kapali"));
  } else {
    check("dev'de 404 (session yok, token gecersiz)", mock.status === 404 || mock.status === 400);
  }

  console.log("\n10) 3D Secure sayfasi /odeme/3d/[token] — PROD'da notFound");
  const dsec = await request("/odeme/3d/fake-token");
  if (process.env.NODE_ENV === "production") {
    check("404 (prod'da notFound())", dsec.status === 404, `got ${dsec.status}`);
  }

  console.log("\n11) Admin panel login redirect (yetkisiz → /yonetim)");
  const admin = await request("/admin", { redirect: "manual" });
  check("redirect veya login", [302, 307, 401, 403].includes(admin.status) || admin.text.includes("Giris"), `got ${admin.status}`);

  console.log("\n12) Admin API yetkisiz erişim");
  const adminApi = await request("/api/admin/products/template");
  check("401 veya 403 (auth)", [401, 403].includes(adminApi.status), `got ${adminApi.status}`);

  console.log("\n13) Dealer API yetkisiz erişim");
  const dealerApi = await request("/api/dealer/bulk-order/template");
  check("401 veya 403 (auth)", [401, 403].includes(dealerApi.status), `got ${dealerApi.status}`);

  console.log("\n14) Storefront static pageler");
  for (const p of ["/hakkimizda", "/iletisim", "/kvkk", "/iade", "/sss", "/giris", "/kayit", "/bayi-basvuru", "/favoriler"]) {
    const r = await request(p);
    check(`${p} → 200`, r.status === 200, `got ${r.status}`);
  }

  console.log("\n15) /robots.txt");
  const robots = await request("/robots.txt");
  check("200", robots.status === 200);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
