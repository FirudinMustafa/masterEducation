/**
 * W4 — Sepet edge case'leri.
 *
 * - Stoksuz urun sepete eklenebilir mi? (Backend stok kontrolu var mi?)
 * - Sepet adresi olmadan checkout'a gidilebilir mi?
 * - Gecersiz kupon kodu net hata mesaji ile reddediliyor mu?
 * - Negatif adet enjekte ediliyor mu?
 */
import { test, expect } from "@playwright/test";
import { detectMasterEducationServer, recordFinding } from "./_helpers";

const CUSTOMER_EMAIL = "qa-fixture-customer@qa.local";
const CUSTOMER_PASSWORD = "QaFixture2026!";

async function loginCustomer(page: import("@playwright/test").Page) {
  await page.goto("/giris");
  await page.locator('input[type="email"]').first().fill(CUSTOMER_EMAIL);
  await page.locator('input[type="password"]').first().fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: /(giris|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 10_000 }).catch(() => {});
}

test("W4: cart with out-of-stock product shows clear warning", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  // Find an out-of-stock product
  const search = await request.get("/api/products?limit=50");
  if (!search.ok()) {
    recordFinding({
      title: "W4: GET /api/products failed",
      category: "test-env-gap",
      severity: "P2",
      role: "anonymous",
      url: "/api/products",
      steps: ["GET /api/products?limit=50"],
      expected: "200 OK",
      actual: `HTTP ${search.status()}`,
      workflow: "W4",
    });
    return;
  }
  const data = (await search.json()) as { products?: Array<{ slug?: string; stockQuantity?: number; isActive?: boolean }> };
  const outOfStock = (data.products ?? []).find((p) => p.stockQuantity === 0 && p.isActive !== false && p.slug);

  if (!outOfStock?.slug) {
    recordFinding({
      title: "W4: Cannot find any out-of-stock active product in first 50",
      category: "test-env-gap",
      severity: "P3",
      role: "system",
      url: "/api/products",
      steps: ["Look for product with stockQuantity=0 && isActive=true"],
      expected: "At least 1 such product (DB has 2494 out-of-stock)",
      actual: "None in first 50 results — may be filtered server-side",
      workflow: "W4",
    });
    return;
  }

  await page.goto(`/urunler/${outOfStock.slug}`);
  const body = await page.textContent("body").catch(() => "");

  const showsOutOfStock = /stokta yok|stok yok|out of stock|tukenmistir|tukendi/i.test(body ?? "");
  if (!showsOutOfStock) {
    recordFinding({
      title: `W4: Out-of-stock product /urunler/${outOfStock.slug} doesn't show "stokta yok" notice`,
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url: `/urunler/${outOfStock.slug}`,
      steps: ["Find product with stockQuantity=0", "Visit product detail page", "Look for out-of-stock notice"],
      expected: "Visible 'Stokta yok' badge/banner + disabled 'Sepete ekle' button",
      actual: `Page text contains no out-of-stock phrase. Preview: "${(body ?? "").slice(0, 200)}"`,
      suggested_fix: "Render <Badge>Stokta yok</Badge> when stockQuantity===0 in src/app/(storefront)/urunler/[slug]/page.tsx",
      workflow: "W4",
    });
  }

  // Check if "Sepete ekle" button is disabled
  const addBtn = page.getByRole("button", { name: /sepete ekle|add to cart/i }).first();
  if (await addBtn.count()) {
    const disabled = await addBtn.isDisabled().catch(() => false);
    if (!disabled) {
      recordFinding({
        title: `W4: Out-of-stock product has ENABLED 'Sepete ekle' button`,
        category: "logic",
        severity: "P0",
        role: "anonymous",
        url: `/urunler/${outOfStock.slug}`,
        steps: ["Visit out-of-stock product page", "Locate 'Sepete ekle' button"],
        expected: "Button is disabled or shows 'Stokta yok'",
        actual: "Button is clickable — user can add a product with 0 stock to cart",
        suggested_fix: "Add disabled={stockQuantity <= 0} to AddToCartButton component",
        workflow: "W4",
      });
    }
  }
});

test("W4: invalid coupon code shows clear error message", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  // Try invalid coupon via API directly (avoids needing full cart setup)
  const res = await request.post("/api/coupons/validate", {
    data: { code: "DEFINITELY_NOT_A_REAL_COUPON_XYZ_123" },
    failOnStatusCode: false,
  });
  const body = await res.json().catch(() => null);

  // Expected: 400/404 with { valid: false, error: "Kupon bulunamadi" } or similar Turkish
  if (res.status() === 200 && body?.valid === true) {
    recordFinding({
      title: "W4: /api/coupons/validate returns valid=true for non-existent code",
      category: "logic",
      severity: "P0",
      role: "anonymous",
      url: "/api/coupons/validate",
      steps: ["POST /api/coupons/validate { code: 'INVALID_XYZ' }"],
      expected: "valid:false with Turkish error message",
      actual: `valid:true returned for non-existent code (body: ${JSON.stringify(body).slice(0, 200)})`,
      suggested_fix: "Check coupon lookup logic — must return valid:false when no row found",
      workflow: "W4",
    });
  }

  const errMsg = body?.error ?? body?.message ?? "";
  if (errMsg && !/kupon|gecersiz|bulunamadi/i.test(errMsg)) {
    recordFinding({
      title: "W4: Invalid coupon error message is not in Turkish",
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url: "/api/coupons/validate",
      steps: ["POST /api/coupons/validate with invalid code"],
      expected: "Turkish error message (e.g. 'Kupon bulunamadi' / 'Gecersiz kupon')",
      actual: `Error: "${errMsg}"`,
      workflow: "W4",
    });
  }
});

test("W4: negative qty in order payload is rejected (validation)", async ({ request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  // Try POST /api/orders with negative qty (without auth — should 401 first, but if accepted it's a Zod gap)
  const res = await request.post("/api/orders", {
    data: {
      items: [{ productId: "fake-id", quantity: -5 }],
      paymentMethod: "CREDIT_CARD",
      shippingAddress: {},
    },
    failOnStatusCode: false,
  });

  if (res.status() === 500) {
    const body = await res.text().catch(() => "");
    recordFinding({
      title: "W4: POST /api/orders with negative qty returns 500 instead of 400",
      category: "logic",
      severity: "P1",
      role: "anonymous",
      url: "/api/orders",
      steps: ["POST /api/orders with items[0].quantity=-5"],
      expected: "400 Bad Request (Zod schema rejects negative qty)",
      actual: `500 Internal Server Error. Body: "${body.slice(0, 200)}"`,
      suggested_fix: "Add z.number().int().positive() to quantity field in orderCreateSchema",
      workflow: "W4",
    });
  }
});
