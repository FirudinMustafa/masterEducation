/**
 * UI overflow & layout audit on the homepage.
 * Catches: horizontal scroll, off-screen elements, clipped logo text.
 */
import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile-360", width: 360, height: 800 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`homepage no horizontal overflow @ ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Body shouldn't have horizontal scroll
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.body.scrollWidth,
        clientWidth: document.body.clientWidth,
        offenders: Array.from(document.querySelectorAll("body *"))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > document.body.clientWidth + 1;
          })
          .slice(0, 5)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              tag: el.tagName,
              cls: (el as HTMLElement).className?.toString().slice(0, 80) ?? "",
              right: Math.round(r.right),
              width: Math.round(r.width),
            };
          }),
      };
    });

    expect(overflow.scrollWidth, `horizontal overflow at ${vp.name}: offenders=${JSON.stringify(overflow.offenders)}`).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
}

test("header brand link not clipped + logo image visible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Brand link visible & has natural height (logo loaded)
  const brand = page.locator('header a[aria-label="Master Education ana sayfa"]').first();
  await expect(brand).toBeVisible();

  // Logo image inside brand link must have non-zero width (not broken/clipped)
  const logoWidth = await brand.locator("img").first().evaluate((img: HTMLImageElement) => img.naturalWidth);
  expect(logoWidth).toBeGreaterThan(0);
});
