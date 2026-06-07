/**
 * F-UR-005 reproduction: refresh sonrasi oturum kayboluyor mu?
 *
 * 1. Bayi olarak giris yap, /bayi'ye git.
 * 2. F5 (page.reload()) ile sayfayi yenile.
 * 3. URL hala /bayi olmali, /giris'e atmamali.
 *
 * Ayni admin icin de yapilir.
 */
import { test, expect, type Page } from "@playwright/test";

async function loginAt(page: Page, loginPath: string, email: string, password: string) {
  await page.context().clearCookies().catch(() => {});
  await page.goto(loginPath);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*(giris|yonetim)).*$/, { timeout: 15_000 }).catch(() => {});
}

test("Approved dealer survives a hard refresh on /bayi", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAt(page, "/giris", "qa-fixture-approved@qa.local", "QaFixture2026!");
  await page.goto("/bayi");
  expect(page.url()).toContain("/bayi");
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(page.url()).not.toContain("/giris");
  expect(page.url()).toContain("/bayi");
});

test("Admin survives a hard refresh on /admin", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAt(page, "/yonetim", "admin@mastereducation.com.tr", "Master2026!Admin");
  await page.goto("/admin");
  expect(page.url()).toContain("/admin");
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(page.url()).not.toContain("/yonetim");
  expect(page.url()).toContain("/admin");
});

test("Two-tab cookie collision: opening admin login after dealer session", async ({ browser }) => {
  test.setTimeout(120_000);
  // Tek BrowserContext = ayni cookie jar — gercek dunyada "ayni Chrome profil
  // ayni tarayici icinde iki tab" senaryosunu modeller.
  const ctx = await browser.newContext();
  const tabA = await ctx.newPage();
  const tabB = await ctx.newPage();

  // Tab A: bayi giris
  await tabA.goto("/giris");
  await tabA.locator('input[type="email"]').first().fill("qa-fixture-approved@qa.local");
  await tabA.locator('input[type="password"]').first().fill("QaFixture2026!");
  await tabA.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await tabA.waitForURL(/^(?!.*\/giris).*$/, { timeout: 15_000 }).catch(() => {});
  await tabA.goto("/bayi");
  const tabAOk1 = tabA.url().includes("/bayi");

  // Tab B: admin giris (ayni context, cookie overwrite olacak)
  await tabB.goto("/yonetim");
  await tabB.locator('input[type="email"]').first().fill("admin@mastereducation.com.tr");
  await tabB.locator('input[type="password"]').first().fill("Master2026!Admin");
  await tabB.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await tabB.waitForURL(/^(?!.*yonetim).*$/, { timeout: 15_000 }).catch(() => {});
  const tabBOnAdmin = tabB.url().includes("/admin");

  // Tab A'ya don ve refresh
  await tabA.bringToFront();
  await tabA.reload({ waitUntil: "domcontentloaded" });
  const tabAAfterRefresh = tabA.url();

  console.log(JSON.stringify({
    tabAOk1, tabBOnAdmin, tabAAfterRefresh,
  }));

  // Beklenen davranis: tabA simdi admin oturumunu paylasiyor — bayi degil — yani
  // /bayi 'unauthorized' → /yonetim veya /giris veya / olabilir.
  // Bu testin amaci sadece davranisi gozlemlemek; assertion fail etmesin.
  await ctx.close();
});
