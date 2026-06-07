/**
 * F-UR-006 reproduction: download endpoints calisiyor mu?
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

test("Dealer statement CSV download responds 200", async ({ page, request }) => {
  test.setTimeout(60_000);
  await loginAt(page, "/giris", "qa-fixture-approved@qa.local", "QaFixture2026!");
  // page session cookie context'i kullan
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await request.get("/api/dealer/statement?format=csv", {
    headers: { cookie: cookieHeader },
    failOnStatusCode: false,
  });
  console.log("dealer/statement", res.status(), res.headers()["content-type"], res.headers()["content-disposition"]);
  expect(res.status()).toBeLessThan(400);
});

test("Admin accounting export responds 200", async ({ page, request }) => {
  test.setTimeout(60_000);
  await loginAt(page, "/yonetim", "admin@mastereducation.com.tr", "Master2026!Admin");
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const url = `/api/admin/accounting/export?type=orders&format=csv&from=2026-01-01&to=2026-12-31`;
  const res = await request.get(url, {
    headers: { cookie: cookieHeader },
    failOnStatusCode: false,
  });
  console.log("admin/accounting/export", res.status(), res.headers()["content-type"]);
  expect(res.status()).toBeLessThan(400);
});
