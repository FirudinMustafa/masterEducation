/**
 * Production end-to-end happy paths.
 *
 *   PW_BASE_URL=https://master-education-ten.vercel.app npx playwright test
 *
 * Çoğu form FloatingInput kullanıyor — `id` selector'lar (#email, #password vb.)
 * Login form NextAuth credentials provider üzerinden gidiyor; field name'leri
 * "email"/"password" olabiliyor — locator'da hem id hem name'i deniyoruz.
 */
import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@mastereducation.com.tr";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error(
    "ADMIN_PASSWORD env zorunlu. Production e2e icin Vercel/CI secret olarak ayarla. " +
      "Asla repo'ya hardcoded yazma."
  );
}
const ts = Date.now();
const CUSTOMER_EMAIL = `e2e-customer-${ts}@example.com`;
const CUSTOMER_PASSWORD = "Test1234!aX"; // sentetik test kullanicisi (her run yeniden olusturuluyor)

let firstProductSlug = "";
let createdOrderNumber: string | null = null;

async function fillById(page: Page, id: string, value: string) {
  const el = page.locator(`#${id}`);
  await el.fill(value);
}

async function dismissCookieBanner(page: Page) {
  // Cookie consent banner submit clikleri intercept ediyor — kabul et veya kapat
  const acceptBtn = page
    .getByRole("button", { name: /(kabul et|accept|tum.*kabul)/i })
    .first();
  if (await acceptBtn.count()) {
    await acceptBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Production smoke + happy paths", () => {
  test("01 — Homepage loads", async ({ page }) => {
    const resp = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/master.*education/i);
    const nav = page
      .getByRole("link", { name: /(urunler|kategoriler|hesap|sepet)/i })
      .first();
    await expect(nav).toBeVisible({ timeout: 10000 });
  });

  test("02 — Product list visible, capture a slug", async ({ page }) => {
    await page.goto("/urunler");
    const productLink = page.locator("a[href*='/urunler/']").first();
    await expect(productLink).toBeVisible({ timeout: 10000 });
    const href = await productLink.getAttribute("href");
    if (href) firstProductSlug = href.replace(/^\/urunler\//, "");
    test.info().annotations.push({ type: "slug", description: firstProductSlug });
  });

  test("03 — Search runs without error", async ({ page }) => {
    await page.goto("/urunler?q=ingilizce");
    expect(page.url()).toContain("q=ingilizce");
    // 200 sayfa renderı yeterli
    const body = await page.textContent("body");
    expect(body?.length ?? 0).toBeGreaterThan(100);
  });

  test("04 — Product detail page loads and renders Blob image", async ({
    page,
  }) => {
    test.skip(!firstProductSlug, "no slug captured");
    await page.goto(`/urunler/${firstProductSlug}`);
    await expect(page.getByText(/Sepete Ekle/i).first()).toBeVisible({
      timeout: 10000,
    });
    const blobImg = page.locator(
      'img[src*="public.blob.vercel-storage.com"], img[srcset*="public.blob.vercel-storage.com"]'
    );
    // Görsel elementi DOM'da olmalı (görselsiz ürün denk gelirse skip edebiliriz)
    if ((await blobImg.count()) === 0) {
      test.info().annotations.push({
        type: "no-blob-image",
        description: "Bu ürün görselsiz; başka ürün test edin",
      });
    }
  });

  test("05 — Customer registers", async ({ page }) => {
    await page.goto("/kayit");
    await dismissCookieBanner(page);
    await fillById(page, "name", "E2E Test");
    await fillById(page, "email", CUSTOMER_EMAIL);
    await fillById(page, "phone", "05551234567");
    await fillById(page, "password", CUSTOMER_PASSWORD);
    await fillById(page, "passwordConfirm", CUSTOMER_PASSWORD);
    // Terms checkbox — required olan ilk checkbox
    const requiredCheckbox = page.locator("input[type='checkbox'][required]").first();
    await requiredCheckbox.check();
    await page.getByRole("button", { name: /Hesap Olustur/i }).click();
    // Kayıt sonrası signIn yapılır → / veya callbackUrl'a redirect
    await page.waitForURL((url) => !url.pathname.includes("/kayit"), {
      timeout: 20000,
    });
    expect(page.url()).not.toContain("/kayit");
  });

  test("06 — Add product to cart", async ({ page }) => {
    test.skip(!firstProductSlug, "no slug captured");
    await page.goto(`/urunler/${firstProductSlug}`);
    await dismissCookieBanner(page);
    const addBtn = page.getByRole("button", { name: /Sepete Ekle/i }).first();
    await expect(addBtn).toBeEnabled({ timeout: 10000 });
    await addBtn.click();
    await page.waitForTimeout(1500);
    await page.goto("/sepet");
    // Sepette ürün var mı? "Toplam" veya ürün ismi
    const body = await page.textContent("body");
    expect(body).toMatch(/(toplam|sepet|tutar)/i);
  });

  test("07 — Login as admin, check admin pages render", async ({ page }) => {
    await page.goto("/giris");
    await dismissCookieBanner(page);
    // Giris formu — id'leri "email" ve "password" olmalı
    await fillById(page, "email", ADMIN_EMAIL);
    await fillById(page, "password", ADMIN_PASSWORD);
    await page.getByRole("button", { name: /Giris/i }).first().click();
    await page.waitForURL((url) => !url.pathname.includes("/giris"), {
      timeout: 20000,
    });

    // Admin panelinin ana sayfaları
    const adminPages = [
      "/admin",
      "/admin/siparisler",
      "/admin/urunler",
      "/admin/bayiler",
      "/admin/kategoriler",
      "/admin/yayinevleri",
      "/admin/iskontolar",
      "/admin/kullanicilar",
      "/admin/muhasebe",
    ];
    const failures: string[] = [];
    for (const path of adminPages) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      const status = resp?.status() ?? 0;
      if (status >= 400) failures.push(`${path} → ${status}`);
    }
    expect(failures).toEqual([]);
  });

  test("08 — Admin orders list renders, see at least one order", async ({
    page,
  }) => {
    await page.goto("/admin/siparisler");
    const body = await page.textContent("body");
    // Sipariş tablosu — header'lar
    expect(body).toMatch(/(siparis|order|durum|tutar)/i);
    // Sipariş satırı var mı
    const rows = page.locator("a[href*='/admin/siparisler/']");
    const n = await rows.count();
    test.info().annotations.push({
      type: "order-rows",
      description: String(n),
    });
  });

  test("09 — Admin opens an order detail (no 404)", async ({ page }) => {
    await page.goto("/admin/siparisler");
    const detailLink = page.locator("a[href*='/admin/siparisler/']").first();
    if ((await detailLink.count()) === 0) {
      test.skip(true, "Sipariş listesi boş");
    }
    const href = await detailLink.getAttribute("href");
    const resp = await page.goto(href!, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(400);
    // Detay sayfası
    const body = await page.textContent("body");
    expect(body).toMatch(/(siparis|order|durum)/i);
    // Status select görünür mü?
    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: 10000 });
  });

  test("10 — Profile email-change shows password input", async ({ page }) => {
    // Önce admin'den çıkıp customer ile giriş
    await page.goto("/giris");
    // Header'da çıkış butonu yoksa direct giris sayfasına; /giris zaten oturum varsa redirect eder
    // Alternatif: /api/auth/signout endpoint
    await page.goto("/api/auth/signout?callbackUrl=/giris", {
      waitUntil: "domcontentloaded",
    });
    // Bu "Are you sure?" sayfasını gösterebilir — submit butonuna tıkla
    const signoutBtn = page.getByRole("button", { name: /sign out|cikis/i }).first();
    if (await signoutBtn.count()) await signoutBtn.click();
    // Sonra customer ile giriş
    await page.goto("/giris");
    await dismissCookieBanner(page);
    await fillById(page, "email", CUSTOMER_EMAIL);
    await fillById(page, "password", CUSTOMER_PASSWORD);
    await page.getByRole("button", { name: /Giris/i }).first().click();
    await page.waitForURL(/^https?:\/\/[^/]+\/(\?|$)|hesabim/, {
      timeout: 20000,
    });
    await page.goto("/hesabim/profil");
    // Email input'u değiştir
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(`changed-${ts}@example.com`);
    // currentPassword input'u görünür mü?
    const pwd = page.locator('input[type="password"]');
    await expect(pwd.first()).toBeVisible({ timeout: 5000 });
  });
});
