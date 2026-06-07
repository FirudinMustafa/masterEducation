/**
 * Cross-Role Journey — Customer end-to-end.
 *
 * Anon → home → product list → product detail → add to cart → cart adjust →
 * register new customer OR login with fixture → checkout → order list → relogin → order persists.
 *
 * Findings are written to findings-cross-customer.jsonl (per-spec scope), not the
 * shared workflow file. We keep using _helpers.uniqueEmail / readOrderState for the
 * DB-backed checks.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  detectMasterEducationServer,
  uniqueEmail,
  readOrderState,
  takeEvidenceScreenshot,
} from "./_helpers";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-30-1842";
const FINDINGS_FILE = path.resolve(
  process.cwd(),
  `qa-run/${QA_RUN_DIR}/findings/findings-cross-customer.jsonl`,
);
let nextId = 1;
type Severity = "P0" | "P1" | "P2" | "P3";
type Category =
  | "security"
  | "logic"
  | "ui"
  | "perf"
  | "observability"
  | "test-env-gap"
  | "illogical";

interface Finding {
  title: string;
  category: Category;
  severity: Severity;
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  suggested_fix?: string;
}

function rec(f: Finding) {
  const row = {
    id: `F-CC-${String(nextId++).padStart(3, "0")}`,
    status: "open",
    source: "cross-customer",
    scope_check: "ok",
    workflow: "cross-customer-journey",
    ...f,
  };
  if (!fs.existsSync(path.dirname(FINDINGS_FILE))) {
    fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
  }
  fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
}

const FIXTURE_PASSWORD = "QaFixture2026!";
const CUSTOMER_EMAIL = "qa-fixture-customer@qa.local";

async function loginAs(page: Page, email: string, password = FIXTURE_PASSWORD) {
  await page.goto("/giris");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 15_000 }).catch(() => {});
}

test.describe.configure({ mode: "default" });

test("cross-customer: anon home/product/cart flow renders without crash", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    rec({
      title: "Dev server is not Master Education (cross-customer cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
    });
    test.skip(true, env.reason);
    return;
  }

  // Home
  const homeRes = await page.goto("/", { waitUntil: "domcontentloaded" });
  if (!homeRes || homeRes.status() >= 400) {
    rec({
      title: `Anon home / returned HTTP ${homeRes?.status() ?? "n/a"}`,
      category: "logic",
      severity: "P0",
      role: "anonymous",
      url: "/",
      steps: ["GET /"],
      expected: "200 OK",
      actual: `HTTP ${homeRes?.status()}`,
    });
  }

  // Product list
  const plRes = await page.goto("/urunler", { waitUntil: "domcontentloaded" });
  if (plRes && plRes.status() >= 400) {
    rec({
      title: `Anon /urunler returned HTTP ${plRes.status()}`,
      category: "logic",
      severity: "P0",
      role: "anonymous",
      url: "/urunler",
      steps: ["GET /urunler"],
      expected: "200 OK",
      actual: `HTTP ${plRes.status()}`,
    });
  }
  const firstCard = page.locator('a[href*="/urunler/"]').first();
  await firstCard.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await firstCard.count())) {
    rec({
      title: "Anon /urunler: no product card links visible",
      category: "logic",
      severity: "P1",
      role: "anonymous",
      url: "/urunler",
      steps: ["GET /urunler", "Search for a[href*='/urunler/']"],
      expected: ">=1 product card",
      actual: "0 cards",
    });
    test.skip(true, "no product cards");
    return;
  }
  const href = await firstCard.getAttribute("href");
  await firstCard.click();
  await page.waitForLoadState("domcontentloaded");

  // Product detail
  const addToCart = page.getByRole("button", { name: /(sepete ekle|add to cart)/i }).first();
  await addToCart.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await addToCart.count())) {
    await takeEvidenceScreenshot(page, testInfo, "anon-no-add-to-cart");
    rec({
      title: `Anon product detail '${href}' has no 'Sepete Ekle' button`,
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url: href ?? page.url(),
      steps: ["Open first product detail", "Look for Sepete Ekle"],
      expected: "Add-to-cart button visible (anonymous customers may add to cart)",
      actual: "Button not found",
    });
  } else {
    await addToCart.click().catch(() => {});
  }

  // Cart page
  const cartRes = await page.goto("/sepet", { waitUntil: "domcontentloaded" });
  if (cartRes && cartRes.status() >= 500) {
    rec({
      title: `/sepet returned HTTP ${cartRes.status()} for anon after add-to-cart`,
      category: "logic",
      severity: "P0",
      role: "anonymous",
      url: "/sepet",
      steps: ["Add a product", "GET /sepet"],
      expected: "200 OK",
      actual: `HTTP ${cartRes.status()}`,
    });
  }
  const cartBody = await page.locator("body").innerText().catch(() => "");
  if (/error|hata|crashed/i.test(cartBody) && cartBody.length < 500) {
    rec({
      title: "/sepet shows error text and very short body",
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url: "/sepet",
      steps: ["GET /sepet", "Read body text"],
      expected: "Empty-cart or cart-line UI",
      actual: cartBody.slice(0, 200),
    });
  }
});

test("cross-customer: register a brand-new customer", async ({ page, request }, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const email = uniqueEmail("cc");
  await page.goto("/kayit");
  await page.locator('input[name="name"], input[name="fullName"], #name').first().fill("CrossCustomer QA").catch(() => {});
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  const phoneLoc = page.locator('input[name="phone"], #phone, input[type="tel"]').first();
  if (await phoneLoc.count()) await phoneLoc.fill("05551234567").catch(() => {});
  // Fill all password fields (handles "Şifre" + "Şifre tekrar")
  const passLocs = page.locator('input[type="password"], input[name="password"], input[name*="password"i]');
  const pn = await passLocs.count();
  for (let i = 0; i < pn; i++) await passLocs.nth(i).fill("Test1234!ab").catch(() => {});
  // KVKK / terms
  const checks = page.locator('input[type="checkbox"]');
  const cn = await checks.count();
  for (let i = 0; i < cn; i++) await checks.nth(i).check({ force: true }).catch(() => {});
  await page.getByRole("button", { name: /(kay[ıi]t|kaydol|signup|register|olu[sş]tur|hesap olu[sş]tur)/i }).first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  const body = await page.locator("body").innerText().catch(() => "");
  if (/error|hata 500|something went wrong/i.test(body) && !/dogrula|verify|onay/i.test(body)) {
    await takeEvidenceScreenshot(page, testInfo, "register-error");
    rec({
      title: "Customer register form shows error after submit",
      category: "logic",
      severity: "P1",
      role: "customer",
      url: "/kayit",
      steps: [`POST register form with ${email}`],
      expected: "Success page or email-verify prompt",
      actual: body.slice(0, 250),
    });
  }
});

test("cross-customer: fixture login → place order → relogin sees order", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  await loginAs(page, CUSTOMER_EMAIL);
  // Verify we landed off /giris
  if (/\/giris/.test(page.url())) {
    rec({
      title: "Fixture customer login did not leave /giris",
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/giris",
      steps: [`Login as ${CUSTOMER_EMAIL}`],
      expected: "Redirect away from /giris",
      actual: `URL is ${page.url()}`,
    });
    return;
  }

  // /hesabim should show name or role
  await page.goto("/hesabim");
  const accountBody = await page.locator("body").innerText().catch(() => "");
  if (!/qa|fixture|hesab|profil|adres|sipari/i.test(accountBody)) {
    rec({
      title: "/hesabim does not display recognizable account content",
      category: "ui",
      severity: "P2",
      role: "customer",
      url: "/hesabim",
      steps: ["Login as fixture customer", "GET /hesabim"],
      expected: "Page contains profile/name/orders content",
      actual: accountBody.slice(0, 200),
    });
  }

  // Add a product to cart
  await page.goto("/urunler");
  const firstCard = page.locator('a[href*="/urunler/"]').first();
  await firstCard.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await firstCard.count())) { test.skip(true, "no products"); return; }
  await firstCard.click();
  const addToCart = page.getByRole("button", { name: /(sepete ekle|add to cart)/i }).first();
  await addToCart.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await addToCart.count()) await addToCart.click().catch(() => {});

  // Snapshot cart total before checkout
  await page.goto("/sepet");
  const cartText = await page.locator("body").innerText().catch(() => "");
  const totalBefore = cartText.match(/toplam[^\d]{0,15}([\d.,]+)/i)?.[1];

  // Try to qty +1 if there's a + button
  const incBtn = page.locator('button[aria-label*="art"i], button:has-text("+")').first();
  if (await incBtn.count()) {
    await incBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    const cartText2 = await page.locator("body").innerText().catch(() => "");
    const totalAfter = cartText2.match(/toplam[^\d]{0,15}([\d.,]+)/i)?.[1];
    if (totalBefore && totalAfter && totalBefore === totalAfter) {
      rec({
        title: "Cart total did not change after qty increase",
        category: "logic",
        severity: "P1",
        role: "customer",
        url: "/sepet",
        steps: ["Add product", "Click qty + button", "Compare totals"],
        expected: "Total increases with qty",
        actual: `Before ${totalBefore} == After ${totalAfter}`,
      });
    }
  }

  // Go to checkout. Helper that swallows timeouts so nothing hangs the test.
  const tryFill = async (sel: string, val: string) => {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) {
      await el.fill(val, { timeout: 4_000 }).catch(() => {});
    }
  };
  const trySelect = async (sel: string, label: string) => {
    const el = page.locator(sel).first();
    if (await el.count().catch(() => 0)) {
      await el.selectOption({ label }, { timeout: 4_000 }).catch(async () => {
        await el.selectOption(label, { timeout: 4_000 }).catch(() => {});
      });
    }
  };
  await page.goto("/odeme");
  await page.waitForLoadState("domcontentloaded");

  // Try select address radio (if a stored one exists)
  const addrRadio = page.locator('input[type="radio"][name*="address"]').first();
  if (await addrRadio.count().catch(() => 0)) {
    await addrRadio.check({ force: true, timeout: 4_000 }).catch(() => {});
  }

  // Always try to fill inline shipping form (Ad Soyad / Email / Telefon / Il / Ilce / Adres)
  await tryFill('input[name="fullName"], input[placeholder*="Ad Soyad"i]', "CrossCustomer QA");
  await tryFill('input[type="email"], input[name="email"]', CUSTOMER_EMAIL);
  await tryFill('input[type="tel"], input[name="phone"]', "05551234567");
  await trySelect('select[name="city"], select[aria-label*="Il"i]', "İstanbul");
  await trySelect('select[name="district"], select[aria-label*="Ilçe"i], select[aria-label*="Ilce"i]', "Kadıköy");
  await tryFill('textarea[name="address"], textarea[name="addressLine"], textarea[placeholder*="adres"i]', "Test mah. Demo cad. No 1");

  // Check all checkboxes (KVKK + Mesafeli Satis)
  const allChecks = page.locator('input[type="checkbox"]');
  const n = await allChecks.count().catch(() => 0);
  for (let i = 0; i < n; i++) await allChecks.nth(i).check({ force: true, timeout: 3_000 }).catch(() => {});

  // CREDIT_CARD radio
  const ccRadio = page.locator('input[value="CREDIT_CARD"], input[type="radio"][name*="payment"]').first();
  if (await ccRadio.count().catch(() => 0)) await ccRadio.check({ force: true, timeout: 3_000 }).catch(() => {});

  await tryFill('input[name="cardNumber"], input[placeholder*="kart numarası"i]', "4242 4242 4242 4242");
  await tryFill('input[name="cardHolder"], input[placeholder*="kart üzerindeki"i]', "QA CUSTOMER");
  await tryFill('input[name="expiry"], input[placeholder*="ay/yıl"i], input[placeholder*="mm"i]', "12/29");
  await tryFill('input[name="cvv"], input[placeholder*="cvv"i]', "123");

  await takeEvidenceScreenshot(page, testInfo, "before-place-order").catch(() => {});

  const placeBtn = page.getByRole("button", { name: /(siparişi tamamla|odeme yap|onayla|öde)/i }).first();
  if (!(await placeBtn.count())) {
    rec({
      title: "Customer checkout: no place-order button visible",
      category: "ui",
      severity: "P1",
      role: "customer",
      url: "/odeme",
      steps: ["Fill checkout form", "Look for submit"],
      expected: "Submit button",
      actual: "Not found",
    });
    return;
  }
  await placeBtn.click().catch(() => {});
  await page.waitForURL(/(odeme\/3d|basarili|basarisiz|hesabim\/siparislerim)/, { timeout: 30_000 }).catch(() => {});

  if (/\/odeme\/3d\//.test(page.url())) {
    await page.locator('input[name="otp"], input[placeholder*="OTP"i], input[placeholder*="kod"i]').first().fill("123456").catch(() => {});
    await page.getByRole("button", { name: /(onayla|dogrula|tamam)/i }).first().click().catch(() => {});
    await page.waitForURL(/(basarili|siparislerim|hesabim)/, { timeout: 30_000 }).catch(() => {});
  }

  // Order list
  await page.goto("/hesabim/siparislerim");
  const orderLink = page.locator('a[href*="/hesabim/siparislerim/"]').first();
  if (!(await orderLink.count())) {
    await takeEvidenceScreenshot(page, testInfo, "no-order-after-place").catch(() => {});
    rec({
      title: "Customer placed order but /hesabim/siparislerim shows nothing",
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/hesabim/siparislerim",
      steps: ["Complete checkout", "GET /hesabim/siparislerim"],
      expected: "Latest order visible",
      actual: "No order links",
    });
    return;
  }
  const orderHref = await orderLink.getAttribute("href");
  const orderNumber = orderHref?.split("/").pop() ?? "";

  // Logout
  await page.goto("/api/auth/signout").catch(() => {});
  await page.context().clearCookies().catch(() => {});

  // Login again
  await loginAs(page, CUSTOMER_EMAIL);
  await page.goto("/hesabim/siparislerim");
  const orderLink2 = page.locator(`a[href*="/hesabim/siparislerim/"]`).first();
  if (!(await orderLink2.count())) {
    rec({
      title: "Order disappeared after re-login (persistence broken)",
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/hesabim/siparislerim",
      steps: ["Place order", "Logout", "Login", "Check orders list"],
      expected: "Order persists",
      actual: "No orders shown after re-login",
    });
  }

  if (orderNumber) {
    const snap = readOrderState(orderNumber);
    if (snap && snap.status === null) {
      rec({
        title: `Order ${orderNumber} has null status in DB`,
        category: "logic",
        severity: "P1",
        role: "system",
        url: `/hesabim/siparislerim/${orderNumber}`,
        steps: ["Read order via Prisma"],
        expected: "Non-null status",
        actual: "null",
      });
    }
  }
});
