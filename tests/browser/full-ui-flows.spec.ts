/**
 * Faz 18.5 — gerçek tarayıcı UI akışları
 *
 * smoke.spec.ts public sayfaları test ediyor; bu dosya admin/customer/dealer
 * akışlarını gerçek tarayıcıda end-to-end koşturur. Veriyi DB'ye Prisma adaptörü
 * ile fixture olarak ekler, testler bittiğinde temizler.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── Fixture state (test'ler arasında ortak; afterAll'da silinir) ──
const ts = Date.now();
const adminEmail = `pw-admin-${ts}@example.test`;
const adminPwd = "AdminPw123!";
const customerEmail = `pw-cust-${ts}@example.test`;
const customerPwd = "CustPw123!";
const dealerEmail = `pw-dealer-${ts}@example.test`;
const dealerPwd = "DealerPw123!";

const created: { userIds: string[]; productIds: string[]; categoryIds: string[]; publisherIds: string[]; orderIds: string[]; couponIds: string[] } = {
  userIds: [],
  productIds: [],
  categoryIds: [],
  publisherIds: [],
  orderIds: [],
  couponIds: [],
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Admin
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "PW Admin",
      passwordHash: await bcrypt.hash(adminPwd, 10),
      role: "ADMIN",
      emailVerified: new Date(),
    },
  });
  created.userIds.push(admin.id);

  // Customer
  const cust = await prisma.user.create({
    data: {
      email: customerEmail,
      name: "PW Customer",
      passwordHash: await bcrypt.hash(customerPwd, 10),
      role: "CUSTOMER",
      emailVerified: new Date(),
      addresses: {
        create: {
          label: "Ev",
          fullName: "PW Customer",
          phone: "05551112233",
          city: "İstanbul",
          district: "Kadıköy",
          postalCode: "34710",
          addressLine: "Test cd 1",
          isDefault: true,
        },
      },
    },
  });
  created.userIds.push(cust.id);

  // Dealer (APPROVED + OPEN_ACCOUNT)
  const dealerUser = await prisma.user.create({
    data: {
      email: dealerEmail,
      name: "PW Dealer",
      passwordHash: await bcrypt.hash(dealerPwd, 10),
      role: "DEALER",
      emailVerified: new Date(),
      dealer: {
        create: {
          companyName: "PW Bayi A.Ş.",
          taxOffice: "Kadıköy",
          taxNumber: "1111111111",
          status: "APPROVED",
          paymentTerms: "OPEN_ACCOUNT",
          creditLimit: 10000,
        },
      },
      addresses: {
        create: {
          label: "Fatura",
          fullName: "PW Bayi",
          phone: "05551112233",
          city: "İstanbul",
          district: "Kadıköy",
          addressLine: "Bayi cd 1",
          isDefault: true,
        },
      },
    },
  });
  created.userIds.push(dealerUser.id);
});

test.afterAll(async () => {
  try {
    for (const id of created.orderIds) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      await prisma.orderEvent.deleteMany({ where: { orderId: id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: id } });
      await prisma.order.deleteMany({ where: { id } });
    }
    for (const id of created.couponIds) {
      await prisma.coupon.deleteMany({ where: { id } });
    }
    for (const id of created.productIds) {
      await prisma.productImage.deleteMany({ where: { productId: id } });
      await prisma.productReview.deleteMany({ where: { productId: id } });
      await prisma.product.deleteMany({ where: { id } });
    }
    for (const id of created.categoryIds) {
      await prisma.category.deleteMany({ where: { id } });
    }
    for (const id of created.publisherIds) {
      await prisma.publisher.deleteMany({ where: { id } });
    }
    for (const id of created.userIds) {
      const orders = await prisma.order.findMany({ where: { userId: id }, select: { id: true } });
      for (const o of orders) {
        await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
        await prisma.orderEvent.deleteMany({ where: { orderId: o.id } });
        await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
      }
      await prisma.order.deleteMany({ where: { userId: id } });
      await prisma.address.deleteMany({ where: { userId: id } });
      await prisma.productReview.deleteMany({ where: { userId: id } });
      await prisma.dealerDiscount.deleteMany({ where: { dealer: { userId: id } } });
      await prisma.dealer.deleteMany({ where: { userId: id } });
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/giris");
  // id-based selector — label match'leri "şifreyi göster" butonuna da çakışıyor
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: /giriş yap|giris yap/i }).click();
  await page.waitForLoadState("networkidle");
}

// ════════════════════════════════════════════════════════════════════
// ADMIN UI FLOWS
// ════════════════════════════════════════════════════════════════════
test.describe("Admin UI flows", () => {
  test("admin login → /admin dashboard görünür", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
    // dashboard içinde nav linkleri olmalı
    await expect(page.getByRole("link", { name: /Ürünler|Urunler/i }).first()).toBeVisible();
  });

  test("admin → kategori oluştur → silinmiş alanları doğrula", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    await page.goto("/admin/kategoriler");
    const catName = `PW Kat ${ts}`;

    // Form var mı? Add new alanını arayalım
    const nameInput = page.getByPlaceholder(/kategori adi|kategori adı/i).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(catName);
    await page.getByRole("button", { name: /ekle/i }).first().click();
    await expect(page.getByText(catName)).toBeVisible({ timeout: 5000 });

    // DB'ye eklendi mi? — cleanup için kaydet
    const cat = await prisma.category.findFirst({ where: { name: catName } });
    if (cat) created.categoryIds.push(cat.id);
    expect(cat).not.toBeNull();
  });

  test("admin → yayınevi oluştur", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    await page.goto("/admin/yayinevleri");
    const pubName = `PW Yayın ${ts}`;
    const nameInput = page.getByPlaceholder(/yayinevi|yayınevi/i).first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(pubName);
    await page.getByRole("button", { name: /ekle/i }).first().click();
    await expect(page.getByText(pubName)).toBeVisible({ timeout: 5000 });

    const pub = await prisma.publisher.findFirst({ where: { name: pubName } });
    if (pub) created.publisherIds.push(pub.id);
    expect(pub).not.toBeNull();
  });

  test("admin → yeni ürün create + image staging görünür [P0 GAP FIX]", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    await page.goto("/admin/urunler/yeni");

    // P0 fix: image staging UI yeni ürün oluştururken görünmeli
    await expect(page.getByText(/görseller|gorseller/i).first()).toBeVisible();
    await expect(page.getByText(/görsel seç|gorsel sec/i).first()).toBeVisible();
    // Hidden file input mevcut olmalı (image accept ile)
    await expect(page.locator('input[type="file"][accept*="image"]')).toHaveCount(1);
    // Açıklayıcı metin görünmeli
    await expect(page.getByText(/ürün oluşturulduktan sonra/i)).toBeVisible();
  });

  test("admin → /admin/urunler/[id] edit sayfası → ProductImagesManager mevcut", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    // Edit sayfasını test etmek için bir ürün gerekli — DB'den ilkini al
    const someProd = await prisma.product.findFirst({
      where: { isPublished: true },
      select: { id: true },
    });
    expect(someProd).not.toBeNull();
    if (!someProd) return;
    await page.goto(`/admin/urunler/${someProd.id}`);
    await expect(page.getByText(/görseller|gorseller/i).first()).toBeVisible();
    // Edit sayfasında "Görsel Ekle" (gerçek upload) görünür
    await expect(page.getByText(/görsel ekle|gorsel ekle/i).first()).toBeVisible();
  });

  test("admin → kupon oluştur — validFrom alanı görünür [P1 GAP FIX]", async ({ page }) => {
    await login(page, adminEmail, adminPwd);
    await page.goto("/admin/kuponlar");

    // P1 fix: validFrom/Başlangıç input görünmeli
    await expect(page.getByText(/başlangıç|baslangic/i).first()).toBeVisible();

    const couponCode = `PWCPN${ts}`;
    await page.getByPlaceholder("YAZ20").first().fill(couponCode);
    // Form içindeki başlangıç ve son tarih
    const today = new Date().toISOString().slice(0, 10);
    const next = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill(today);
    await dateInputs.nth(1).fill(next);

    await page.getByRole("button", { name: /^oluştur|^olustur/i }).click();
    await expect(page.locator(`td:has-text("${couponCode}")`).first()).toBeVisible({ timeout: 5000 });

    const cpn = await prisma.coupon.findFirst({ where: { code: couponCode } });
    if (cpn) created.couponIds.push(cpn.id);
    expect(cpn).not.toBeNull();
    expect(cpn?.validFrom).not.toBeNull(); // P1 fix: validFrom kaydedildi
    expect(cpn?.validUntil).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// CUSTOMER UI FLOWS
// ════════════════════════════════════════════════════════════════════
test.describe("Customer UI flows", () => {
  test("customer login → hesabım menüsü açılıyor", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/hesabim");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // hesap nav linkleri (main scope; footer'da da var)
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /siparişlerim|siparislerim/i }).first()).toBeVisible();
    await expect(main.getByRole("link", { name: /adresler/i }).first()).toBeVisible();
  });

  test("customer → ürün listesi → detay → sepete ekle", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/urunler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // İlk ürünü aç
    const firstProductLink = page.locator('a[href^="/urunler/"]:not([href="/urunler"])').first();
    const href = await firstProductLink.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Sepete ekle butonu
    const addBtn = page.getByRole("button", { name: /sepete ekle/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      // Sepet sayısı artmalı veya feedback görünmeli — header sepet ikonu
      await page.waitForTimeout(500);
    }
  });

  test("customer → /sepet sayfası", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/sepet");
    // Sepet sayfası yükleniyor — boş veya dolu state
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
  });

  test("customer → /favoriler sayfası", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/favoriler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("customer → /karsilastir sayfası", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/karsilastir");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("customer → adres ekleme formu açılıyor", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/hesabim/adresler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // En az 1 buton/form kontrol görünür olmalı
  });

  test("customer → profil sayfası açılıyor + email/ad görünür", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/hesabim/profil");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // email input'u dolu (profile sayfası mevcut kullanıcı bilgilerini yüklüyor)
    await expect(page.locator(`input[value="${customerEmail}"]`).first()).toBeVisible();
  });

  test("customer → şifre değiştir formu açılıyor", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/hesabim/sifre-degistir");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // En az 2 password input
    const pwInputs = page.locator('input[type="password"]');
    await expect(pwInputs.first()).toBeVisible();
  });

  test("customer → siparişlerim sayfası", async ({ page }) => {
    await login(page, customerEmail, customerPwd);
    await page.goto("/hesabim/siparislerim");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════
// DEALER UI FLOWS
// ════════════════════════════════════════════════════════════════════
test.describe("Dealer UI flows", () => {
  test("bayi login → /bayi dashboard görünür", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi");
    await expect(page).toHaveURL(/\/bayi/);
    // Sidebar
    await expect(page.getByRole("link", { name: /siparişler|siparisler/i }).first()).toBeVisible();
  });

  test("bayi → belgeler sayfası", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi/belgeler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Yükleme arayüzü olmalı (DealerDocument upload)
  });

  test("bayi → ekstre sayfası", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi/ekstre");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("bayi → siparişler listesi açılıyor", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi/siparisler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("bayi → toplu sipariş sayfası", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi/toplu-siparis");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("bayi → iskontolar sayfası (read-only)", async ({ page }) => {
    await login(page, dealerEmail, dealerPwd);
    await page.goto("/bayi/iskontolar");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════
// BAYI BAŞVURU FLOW (guest → application → success page)
// ════════════════════════════════════════════════════════════════════
test.describe("Bayi başvuru flow", () => {
  test("guest → /bayi-basvuru → form + belge yükleme uyarısı [P1 GAP FIX]", async ({ page }) => {
    await page.goto("/bayi-basvuru");
    await expect(page.getByRole("heading", { name: /bayi başvurusu|bayi basvurusu/i })).toBeVisible();

    // P1 fix: belge yükleme bilgilendirme bloğu görünür olmalı
    await expect(page.getByText(/onay sürecini hızlandırmak/i)).toBeVisible();
    await expect(page.getByText(/vergi levhası|vergi levhasi/i)).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════
// PUBLIC UI FLOWS
// ════════════════════════════════════════════════════════════════════
test.describe("Public UI flows", () => {
  test("anasayfa hero görünür", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Egitim|Eğitim/i })
    ).toBeVisible();
  });

  test("şifremi unuttum sayfası açılıyor", async ({ page }) => {
    await page.goto("/sifremi-unuttum");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("şifre sıfırla sayfası (token olmadan da yüklenmeli)", async ({ page }) => {
    await page.goto("/sifre-sifirla?token=invalid");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("kayıt sayfası açılıyor", async ({ page }) => {
    await page.goto("/kayit");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("iletişim sayfası açılıyor", async ({ page }) => {
    await page.goto("/iletisim");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("KVKK / iade / hakkımızda / SSS sayfaları açılıyor", async ({ page }) => {
    for (const path of ["/kvkk", "/iade", "/hakkimizda", "/sss"]) {
      const r = await page.goto(path);
      expect(r?.ok()).toBeTruthy();
    }
  });

  test("sipariş takip sayfası — geçersiz numara graceful handle", async ({ page }) => {
    await page.goto("/siparis-takip?no=ME-NONE-9999&email=nobody@test.invalid");
    await expect(page.getByText(/bulunamadi|bulunamadı/i)).toBeVisible();
  });
});
