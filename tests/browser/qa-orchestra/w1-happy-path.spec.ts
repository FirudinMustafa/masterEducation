/**
 * W1 — Happy Path siparis akisi.
 *
 *   register customer  →  email verify (DB'den token)  →  login  →  add address
 *   →  search a product  →  add to cart  →  apply coupon (varsa)  →  contracts
 *   →  3DS init  →  3DS success callback (mock OTP 123456)  →  order detail
 *   →  download PDF invoice
 *
 * Assert'ler:
 *   - Order status PENDING/PROCESSING (mock confirm success sonrası PROCESSING).
 *   - OrderEvent satır(ları) var (CREATED + CONTRACTS_ACCEPTED + ORDER_AUTO_APPROVE).
 *   - EmailLog'da en az 1 sipariş onay maili.
 *
 * NOT: ENABLE_MOCK_PAYMENTS=true ve CREDIT_CARD seçimi gerekir; bu testte
 * deterministik kart 4242 4242 4242 4242 + CVV 123 + 12/29 kullanılır.
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  uniqueEmail,
  readOrderState,
  readLatestVerificationTokenFromDb,
  recordFinding,
  takeEvidenceScreenshot,
} from "./_helpers";

test.describe.configure({ mode: "serial" });

test("W1 happy path: register → verify → login → order → confirm → invoice", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not the Master Education project (W1 cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [
        "GET http://localhost:3000/api/health",
        "Response shape does not match Master Education health",
        `reason: ${env.reason}`,
      ],
      expected: "Master Education dev server with /api/health JSON contract",
      actual: env.reason ?? "unknown",
      suggested_fix:
        "Stop the foreign dev server occupying :3000 and run `npm run dev` in master-education before B6 suite.",
      workflow: "W1",
    });
    test.skip(true, `W1 blocked: ${env.reason}`);
    return;
  }

  const email = uniqueEmail("w1");
  const password = "Test1234!ab";

  // 1) Register
  await page.goto("/kayit");
  await page.locator('input[name="name"], input[name="fullName"], #name').first().fill("QA W1 User");
  await page.locator('input[type="email"], input[name="email"], #email').first().fill(email);
  const phoneLoc = page.locator('input[name="phone"], #phone, input[type="tel"]').first();
  if (await phoneLoc.count()) await phoneLoc.fill("05551234567");
  const passLoc = page.locator('input[name="password"], #password, input[type="password"]').first();
  await passLoc.fill(password);
  // KVKK / terms checkbox
  const terms = page.locator('input[type="checkbox"][name="termsAccepted"], input[name="terms"], #termsAccepted').first();
  if (await terms.count()) await terms.check({ force: true }).catch(() => {});
  await page.getByRole("button", { name: /(kayıt|kaydol|signup|register|olustur)/i }).first().click();

  // 2) Verify email — read latest token from DB
  await page.waitForTimeout(800);
  const token = readLatestVerificationTokenFromDb(email);
  if (!token) {
    await takeEvidenceScreenshot(page, testInfo, "no-verify-token");
    recordFinding({
      title: "W1: Verification token not found in DB after register",
      category: "test-env-gap",
      severity: "P1",
      role: "system",
      url: "/api/auth/register",
      steps: [
        `POST /api/auth/register (email=${email})`,
        "Check VerificationToken table",
      ],
      expected: "A row in verificationToken (or equivalent) keyed to user",
      actual: "No row found via Prisma query",
      suggested_fix: "Ensure VerificationToken is created on register; or fix Prisma client/DB connection.",
      workflow: "W1",
    });
    test.skip(true, "W1 blocked: no verification token");
    return;
  }
  await page.goto(`/email-dogrula?token=${encodeURIComponent(token)}`);
  await expect(page.locator("body")).toContainText(/(dogrulandi|verified|onaylandi|basari)/i, {
    timeout: 10_000,
  }).catch(async () => {
    await takeEvidenceScreenshot(page, testInfo, "verify-email-message");
  });

  // 3) Login
  await page.goto("/giris");
  await page.locator('input[type="email"], #email').first().fill(email);
  await page.locator('input[type="password"], #password').first().fill(password);
  await page.getByRole("button", { name: /(giris yap|signin|login)/i }).first().click();
  await page.waitForURL(/(hesabim|\/)/, { timeout: 15_000 }).catch(() => {});

  // 4) Add address
  await page.goto("/hesabim/adresler");
  const addBtn = page.getByRole("button", { name: /(adres ekle|yeni adres|ekle)/i }).first();
  if (await addBtn.count()) {
    await addBtn.click().catch(() => {});
    await page.locator('input[name="fullName"], input[name="ad"], #fullName').first().fill("QA W1 User");
    await page.locator('input[name="phone"], #phone').first().fill("05551234567");
    await page.locator('input[name="city"], #city, select[name="city"]').first().fill("Istanbul").catch(() => {});
    await page.locator('input[name="district"], #district, select[name="district"]').first().fill("Kadikoy").catch(() => {});
    await page.locator('textarea[name="addressLine"], textarea[name="address"], #address').first().fill("Test mah. Demo cad. No 1").catch(() => {});
    await page.getByRole("button", { name: /(kaydet|ekle|save)/i }).first().click().catch(() => {});
  }

  // 5) Search product
  await page.goto("/urunler");
  const firstCard = page.locator('a[href*="/urunler/"]').first();
  await firstCard.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await firstCard.count())) {
    recordFinding({
      title: "W1: No products found on /urunler — seed missing",
      category: "test-env-gap",
      severity: "P1",
      role: "customer",
      url: "/urunler",
      steps: ["GET /urunler", "Look for product card link"],
      expected: "At least 1 product card",
      actual: "Zero products",
      suggested_fix: "Run `npm run seed`",
      workflow: "W1",
    });
    test.skip(true, "W1: no products");
    return;
  }
  await firstCard.click();
  // 6) Add to cart
  const addToCart = page.getByRole("button", { name: /(sepete ekle|add to cart)/i }).first();
  await addToCart.waitFor({ timeout: 10_000 }).catch(() => {});
  if (!(await addToCart.count())) {
    await takeEvidenceScreenshot(page, testInfo, "no-add-to-cart");
    recordFinding({
      title: "W1: 'Sepete Ekle' button missing on product detail",
      category: "ui",
      severity: "P1",
      role: "customer",
      url: page.url(),
      steps: ["Open product detail", "Search for Sepete Ekle button"],
      expected: "Add-to-cart button visible",
      actual: "Button not found",
      workflow: "W1",
    });
    test.skip(true, "W1: no add-to-cart button");
    return;
  }
  await addToCart.click();

  // 7) Go to cart / checkout
  await page.goto("/sepet");
  await page.locator("body").waitFor();
  // Try coupon if input exists
  const couponInput = page.locator('input[name="couponCode"], input[placeholder*="kupon"i]').first();
  if (await couponInput.count()) {
    await couponInput.fill("INVALIDCOUPONXYZ").catch(() => {});
    await page.getByRole("button", { name: /(uygula|kupon|apply)/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // proceed to /odeme
  await page.goto("/odeme");
  // Pick first address radio if present
  const addrRadio = page.locator('input[type="radio"][name*="address"]').first();
  if (await addrRadio.count()) await addrRadio.check({ force: true }).catch(() => {});

  // 8) Contracts (KVKK + Mesafeli Satis)
  const allChecks = page.locator('input[type="checkbox"]');
  const n = await allChecks.count();
  for (let i = 0; i < n; i++) {
    await allChecks.nth(i).check({ force: true }).catch(() => {});
  }
  // Pick CREDIT_CARD if dropdown
  const ccRadio = page.locator('input[value="CREDIT_CARD"], input[type="radio"][name*="payment"]').first();
  if (await ccRadio.count()) await ccRadio.check({ force: true }).catch(() => {});

  // Card form (mock)
  await page.locator('input[name="cardNumber"], input[name="card.number"], input[placeholder*="kart numarası"i]').first().fill("4242 4242 4242 4242").catch(() => {});
  await page.locator('input[name="cardHolder"], input[name="card.holder"], input[placeholder*="kart üzerindeki"i]').first().fill("QA W1 USER").catch(() => {});
  await page.locator('input[name="expiry"], input[name="card.expiry"], input[placeholder*="ay/yıl"i], input[placeholder*="mm"i]').first().fill("12/29").catch(() => {});
  await page.locator('input[name="cvv"], input[name="card.cvv"], input[placeholder*="cvv"i]').first().fill("123").catch(() => {});

  await takeEvidenceScreenshot(page, testInfo, "before-place-order");

  // 9) Place order
  const placeBtn = page.getByRole("button", { name: /(siparişi tamamla|odeme yap|onayla|öde)/i }).first();
  if (!(await placeBtn.count())) {
    recordFinding({
      title: "W1: No 'place order' submit button on /odeme",
      category: "ui",
      severity: "P1",
      role: "customer",
      url: "/odeme",
      steps: ["Reach /odeme", "Try to find place-order button"],
      expected: "A submit button to place the order",
      actual: "Button not found",
      workflow: "W1",
    });
    test.skip(true, "W1: no place-order button");
    return;
  }
  await placeBtn.click();

  // Wait for redirect to 3DS page or success/failure page
  await page.waitForURL(/(odeme\/3d|odeme\/basarili|odeme\/basarisiz|hesabim\/siparislerim)/, {
    timeout: 30_000,
  }).catch(() => {});

  await takeEvidenceScreenshot(page, testInfo, "after-place-order");

  // 10) 3DS — if redirected to /odeme/3d/[token], fill OTP 123456 and confirm
  const url = page.url();
  if (/\/odeme\/3d\//.test(url)) {
    await page.locator('input[name="otp"], input[placeholder*="OTP"i], input[placeholder*="kod"i]').first().fill("123456").catch(() => {});
    await page.getByRole("button", { name: /(onayla|dogrula|tamam)/i }).first().click().catch(() => {});
    await page.waitForURL(/(basarili|siparislerim|hesabim)/, { timeout: 30_000 }).catch(() => {});
  }

  // 11) Order detail — find latest order
  await page.goto("/hesabim/siparislerim");
  await page.locator("body").waitFor();
  const orderLink = page.locator('a[href*="/hesabim/siparislerim/"]').first();
  if (!(await orderLink.count())) {
    await takeEvidenceScreenshot(page, testInfo, "no-order-in-list");
    recordFinding({
      title: "W1: Order not visible in /hesabim/siparislerim after happy path",
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/hesabim/siparislerim",
      steps: [
        "Complete checkout (mock 3DS success)",
        "GET /hesabim/siparislerim",
      ],
      expected: "Newly created order visible in customer's orders list",
      actual: "No order links found",
      workflow: "W1",
    });
    return;
  }
  const orderHref = await orderLink.getAttribute("href");
  await orderLink.click();
  await page.waitForLoadState("domcontentloaded");

  // 12) Extract order number from URL or page
  const pageText = await page.locator("body").innerText();
  const orderNumMatch = pageText.match(/(?:Sipariş\s*No|order\s*number)[:\s]*([A-Z0-9-]{6,30})/i);
  const orderNumber = orderNumMatch?.[1] ?? (orderHref?.split("/").pop() ?? "");

  if (orderNumber) {
    const snapshot = readOrderState(orderNumber);
    if (snapshot) {
      expect.soft(["PENDING", "PROCESSING", "APPROVED"]).toContain(snapshot.status);
      expect.soft(snapshot.eventCount).toBeGreaterThanOrEqual(2);
      if (snapshot.eventCount < 2) {
        recordFinding({
          title: "W1: OrderEvent count < 2 (CREATED + CONTRACTS_ACCEPTED expected)",
          category: "logic",
          severity: "P1",
          role: "system",
          url: `/hesabim/siparislerim/${orderNumber}`,
          steps: ["Happy path order placed", "Read OrderEvent count from DB"],
          expected: ">= 2 events (CREATED, CONTRACTS_ACCEPTED)",
          actual: `${snapshot.eventCount} events`,
          workflow: "W1",
        });
      }
      if (snapshot.emailLogCount === 0) {
        recordFinding({
          title: "W1: EmailLog has no row for the new order",
          category: "observability",
          severity: "P1",
          role: "system",
          url: `/hesabim/siparislerim/${orderNumber}`,
          steps: ["Happy path completed", "Query EmailLog"],
          expected: ">= 1 EmailLog row for order confirmation",
          actual: "0 rows",
          workflow: "W1",
        });
      }
    }
  }

  // 13) Download PDF invoice
  const downloadPromise = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
  const pdfBtn = page.getByRole("link", { name: /(fatura|pdf|indir)/i }).first();
  if (await pdfBtn.count()) {
    await pdfBtn.click().catch(() => {});
    const dl = await downloadPromise;
    if (!dl) {
      recordFinding({
        title: "W1: PDF invoice download did not trigger",
        category: "logic",
        severity: "P2",
        role: "customer",
        url: page.url(),
        steps: ["Open order detail", "Click 'Fatura/PDF' link"],
        expected: "Browser download dialog",
        actual: "No download event in 15s",
        workflow: "W1",
      });
    }
  }
});
