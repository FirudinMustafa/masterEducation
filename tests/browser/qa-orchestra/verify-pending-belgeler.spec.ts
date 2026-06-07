/**
 * Quick verification spec — PENDING dealer'in /bayi/belgeler sayfasina
 * ulasabildigini ve "Inceleniyor" fallback'i goremedigini dogrular.
 *
 * F-UR-001 fix dogrulamasi icin yazildi.
 */
import { test, expect, type Page } from "@playwright/test";

const PENDING_EMAIL = "qa-fixture-pending@qa.local";
const FIXTURE_PASSWORD = "QaFixture2026!";

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies().catch(() => {});
  await page.goto("/giris");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 15_000 }).catch(() => {});
}

test("PENDING dealer /bayi/belgeler renders the documents page, not the 'Inceleniyor' fallback", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAs(page, PENDING_EMAIL, FIXTURE_PASSWORD);

  // Once /bayi'ye git — burada "Inceleniyor" gormeliyiz
  await page.goto("/bayi", { waitUntil: "domcontentloaded" });
  const dashBody = await page.locator("body").innerText();
  expect(dashBody).toMatch(/inceleniyor|onay bekliyor|basvurunuz/i);

  // Simdi /bayi/belgeler — burada Belgeler sayfasini gormeliyiz, "Inceleniyor" DEGIL
  await page.goto("/bayi/belgeler", { waitUntil: "domcontentloaded" });
  const docBody = await page.locator("body").innerText();
  // Belgeler sayfasinda olmasini bekledigimiz isaretler:
  //  - "Vergi Levhasi" veya "Ticaret Sicil" veya "Belgelerim" baslik
  //  - upload input mevcut
  const hasDocumentUi = /vergi levhasi|ticaret sicil|imza sirkuleri|belge|upload|yukle/i.test(docBody);
  const stillShowsPending = /basvurunuz inceleniyor|basvurunuz alindi/i.test(docBody);

  if (stillShowsPending && !hasDocumentUi) {
    throw new Error(
      `F-UR-001 fix YETERSIZ: /bayi/belgeler hala 'Inceleniyor' fallback'i gosteriyor.\n` +
      `Body preview: ${docBody.slice(0, 300)}`,
    );
  }
  expect(hasDocumentUi).toBe(true);
});
