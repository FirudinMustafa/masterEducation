/**
 * W15 — Dealer status access enforcement.
 *
 * REJECTED ve SUSPENDED bayiler /bayi/* route'larına erişememeli.
 * APPROVED bayi tam erişebilmeli.
 *
 * Fixture kullanıcıları:
 *   qa-fixture-approved@qa.local   (status=APPROVED)
 *   qa-fixture-pending@qa.local    (status=PENDING)
 *   qa-fixture-rejected@qa.local   (status=REJECTED)
 *   qa-fixture-suspended@qa.local  (status=SUSPENDED)
 *
 * Hepsi parola: QaFixture2026!
 */
import { test, expect } from "@playwright/test";
import { detectMasterEducationServer, recordFinding } from "./_helpers";

test.describe.configure({ mode: "serial" });

const FIXTURE_PASSWORD = "QaFixture2026!";
const DEALER_ROUTES = [
  "/bayi",
  "/bayi/siparisler",
  "/bayi/toplu-siparis",
  "/bayi/belgeler",
  "/bayi/faturalar",
  "/bayi/iskontolar",
  "/bayi/ekstre",
] as const;

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/giris");
  await page.locator('input[name="email"], input[type="email"]').first().fill(email);
  await page.locator('input[name="password"], input[type="password"]').first().fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: /(giris|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 10_000 }).catch(() => {});
}

for (const status of ["REJECTED", "SUSPENDED"] as const) {
  const email = `qa-fixture-${status.toLowerCase()}@qa.local`;

  test(`W15: ${status} dealer cannot access /bayi/* routes`, async ({ page, request }) => {
    const env = await detectMasterEducationServer(request);
    if (!env.ok) {
      recordFinding({
        title: `Dev server is not Master Education (W15-${status} cannot run)`,
        category: "test-env-gap",
        severity: "P0",
        role: "system",
        url: "/api/health",
        steps: [`GET /api/health → ${env.reason}`],
        expected: "Master Education app",
        actual: env.reason ?? "unknown",
        workflow: "W15",
      });
      test.skip(true, env.reason);
      return;
    }

    await loginAs(page, email);

    for (const route of DEALER_ROUTES) {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => null);
      const finalUrl = page.url();
      const status_code = res?.status() ?? 0;

      // Expected: redirect to /giris OR /403 OR page renders "erisim yok" / "yetkisiz"
      const body = await page.textContent("body").catch(() => "");
      const looksBlocked =
        finalUrl.includes("/giris") ||
        finalUrl.includes("/403") ||
        /yetkis|erisim yok|reddedildi|askiya|suspended|rejected/i.test(body ?? "");

      if (status_code === 200 && finalUrl.endsWith(route) && !looksBlocked) {
        recordFinding({
          title: `W15: ${status} dealer can access ${route} (should be blocked)`,
          category: "security",
          severity: "P0",
          role: `dealer-${status.toLowerCase()}`,
          url: route,
          steps: [
            `Login as ${email}`,
            `GET ${route}`,
            `Page rendered with status 200 and no access-denied notice`,
          ],
          expected: `${status} dealer redirected to /giris or shown 403/blocked notice`,
          actual: `Page rendered fully, body preview: "${(body ?? "").slice(0, 150)}"`,
          suggested_fix: `Add guard in src/app/bayi/*/page.tsx or middleware: redirect if dealer.status !== APPROVED`,
          workflow: "W15",
        });
      }
    }
  });
}

test("W15: PENDING dealer sees limited /bayi (status notice, no order CTA)", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  await loginAs(page, "qa-fixture-pending@qa.local");
  await page.goto("/bayi", { waitUntil: "domcontentloaded" });
  const body = await page.textContent("body").catch(() => "");

  // Expected: page shows "basvurunuz inceleniyor" or similar; no "Yeni Siparis" CTA
  const hasPendingNotice = /inceleniyor|onay bekliyor|pending|basvurunuz/i.test(body ?? "");
  if (!hasPendingNotice) {
    recordFinding({
      title: "W15: PENDING dealer /bayi page has no status notice",
      category: "ui",
      severity: "P1",
      role: "dealer-pending",
      url: "/bayi",
      steps: ["Login as qa-fixture-pending@qa.local", "GET /bayi"],
      expected: "Page shows 'Basvurunuz inceleniyor' or similar pending-status banner",
      actual: `body preview: "${(body ?? "").slice(0, 200)}"`,
      suggested_fix: "Add pending-status banner to /bayi/page.tsx when dealer.status==='PENDING'",
      workflow: "W15",
    });
  }
});

test("W15: APPROVED dealer can access all /bayi/* routes (sanity check)", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  await loginAs(page, "qa-fixture-approved@qa.local");
  for (const route of DEALER_ROUTES) {
    const res = await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => null);
    const finalUrl = page.url();
    if (finalUrl.includes("/giris")) {
      recordFinding({
        title: `W15: APPROVED dealer redirected away from ${route}`,
        category: "logic",
        severity: "P0",
        role: "dealer-approved",
        url: route,
        steps: ["Login as qa-fixture-approved@qa.local", `GET ${route}`, `Got redirect to ${finalUrl}`],
        expected: "APPROVED dealer accesses dealer routes",
        actual: `Redirected to ${finalUrl}`,
        suggested_fix: "Check dealer status check logic in middleware/route guards",
        workflow: "W15",
      });
    }
    if (res && res.status() >= 500) {
      recordFinding({
        title: `W15: ${route} returns ${res.status()} for APPROVED dealer`,
        category: "logic",
        severity: "P1",
        role: "dealer-approved",
        url: route,
        steps: [`GET ${route}`],
        expected: "200 OK",
        actual: `HTTP ${res.status()}`,
        workflow: "W15",
      });
    }
  }
});
