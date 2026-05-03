import { test, expect } from "@playwright/test";

test.describe("storefront smoke", () => {
  test("homepage renders hero + categories", async ({ page }) => {
    await page.goto("/");
    // Hero + bir section heading görünür olmalı.
    await expect(
      page.getByRole("heading", { name: /tek adresi/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /kesfedin|klasikler|one cikanlar/i }).first()
    ).toBeVisible();
  });

  test("product list links to a detail page", async ({ page }) => {
    await page.goto("/urunler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Cards wrap everything in an anchor and also expose an add-to-cart
    // mini-button. Resolve the first detail href directly instead of clicking
    // which avoids button-vs-card ambiguity.
    const firstHref = await page
      .locator('a[href^="/urunler/"]:not([href="/urunler"])')
      .first()
      .getAttribute("href");
    expect(firstHref).toBeTruthy();
    await page.goto(firstHref!);
    await expect(page).toHaveURL(/\/urunler\/.+/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("tracking page handles unknown order gracefully", async ({ page }) => {
    await page.goto(
      "/siparis-takip?no=ME-NONE-9999&email=nobody@test.invalid"
    );
    await expect(
      page.getByText(/Sorguladiginiz siparis bulunamadi/i)
    ).toBeVisible();
  });

  test("category URL loads products", async ({ page }) => {
    const res = await page.goto("/kategoriler/elt");
    expect(res?.ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { level: 1 })
    ).toBeVisible();
  });

  test("login page renders form", async ({ page }) => {
    await page.goto("/giris");
    await expect(
      page.getByRole("heading", { name: /Giris/i }).first()
    ).toBeVisible();
  });
});
