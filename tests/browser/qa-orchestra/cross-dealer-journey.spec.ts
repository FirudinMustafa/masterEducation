/**
 * Cross-Role Journey — Dealer end-to-end.
 *
 * Anon /bayi-basvuru form → submit new dealer application → fixture logins for
 * each dealer status (PENDING, APPROVED, REJECTED, SUSPENDED) and asserts the
 * expected UI relations (dealer pricing visible only for APPROVED, etc).
 */
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import {
  detectMasterEducationServer,
  uniqueEmail,
  takeEvidenceScreenshot,
} from "./_helpers";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-30-1842";
const FINDINGS_FILE = path.resolve(
  process.cwd(),
  `qa-run/${QA_RUN_DIR}/findings/findings-cross-dealer.jsonl`,
);
let nextId = 1;
interface Finding {
  title: string;
  category: "security" | "logic" | "ui" | "perf" | "observability" | "test-env-gap" | "illogical";
  severity: "P0" | "P1" | "P2" | "P3";
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  suggested_fix?: string;
}
function rec(f: Finding) {
  const row = {
    id: `F-CD-${String(nextId++).padStart(3, "0")}`,
    status: "open",
    source: "cross-dealer",
    scope_check: "ok",
    workflow: "cross-dealer-journey",
    ...f,
  };
  if (!fs.existsSync(path.dirname(FINDINGS_FILE))) {
    fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
  }
  fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
}

const FIXTURE_PASSWORD = "QaFixture2026!";

async function loginAs(page: Page, email: string, password = FIXTURE_PASSWORD) {
  await page.context().clearCookies().catch(() => {});
  await page.goto("/giris");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 12_000 }).catch(() => {});
}

async function extractDealerPriceSignal(page: Page): Promise<{ hasDealerPrice: boolean; bodyPreview: string }> {
  const body = await page.locator("body").innerText().catch(() => "");
  // Heuristic: dealer pricing usually shows "Bayi Fiyat" or "Bayi Fiyatı" / "Net Bayi" label
  const hasDealerPrice = /bayi\s*fiyat|bayi net|net bayi|bayi indirim/i.test(body);
  return { hasDealerPrice, bodyPreview: body.slice(0, 220) };
}

test.describe.configure({ mode: "serial" });

test("cross-dealer: anon /bayi-basvuru form renders + has minimum fields", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    rec({
      title: "Dev server is not Master Education (cross-dealer cannot run)",
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

  const res = await page.goto("/bayi-basvuru", { waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) {
    rec({
      title: `/bayi-basvuru returned HTTP ${res?.status() ?? "n/a"} (anonymous)`,
      category: "logic",
      severity: "P0",
      role: "anonymous",
      url: "/bayi-basvuru",
      steps: ["GET /bayi-basvuru"],
      expected: "200 OK",
      actual: `HTTP ${res?.status()}`,
    });
    return;
  }
  const form = page.locator("form").first();
  if (!(await form.count())) {
    await takeEvidenceScreenshot(page, testInfo, "no-bayi-basvuru-form").catch(() => {});
    rec({
      title: "/bayi-basvuru renders without a <form>",
      category: "ui",
      severity: "P0",
      role: "anonymous",
      url: "/bayi-basvuru",
      steps: ["GET /bayi-basvuru", "Look for form"],
      expected: "Application form visible",
      actual: "No form element",
    });
  }

  // Try submission with synthetic data
  const email = uniqueEmail("dealer-app");
  const tryFill = async (sel: string, val: string) => {
    const el = page.locator(sel).first();
    if (await el.count()) await el.fill(val).catch(() => {});
  };
  await tryFill('input[name="companyName"]', "QA Dealer App AS");
  await tryFill('input[name="taxNumber"]', "1234567890");
  await tryFill('input[name="taxOffice"]', "Kadikoy");
  await tryFill('input[name="email"], input[type="email"]', email);
  await tryFill('input[name="phone"], input[type="tel"]', "05551234567");
  await tryFill('input[name="contactName"], input[name="fullName"]', "QA Dealer Owner");
  await tryFill('input[name="city"]', "Istanbul");
  await tryFill('input[name="district"]', "Kadikoy");
  await tryFill('textarea[name="address"], textarea[name="addressLine"]', "Test mah.");
  const checks = page.locator('input[type="checkbox"]');
  const n = await checks.count();
  for (let i = 0; i < n; i++) await checks.nth(i).check({ force: true }).catch(() => {});
  const submit = page.getByRole("button", { name: /(başvur|gönder|kaydet|submit)/i }).first();
  if (await submit.count()) {
    await submit.click().catch(() => {});
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText().catch(() => "");
    if (/error|500|something went wrong/i.test(body) && !/teşekkür|basari|pending|onay/i.test(body)) {
      await takeEvidenceScreenshot(page, testInfo, "bayi-basvuru-submit-error").catch(() => {});
      rec({
        title: "/bayi-basvuru submit returned visible error",
        category: "logic",
        severity: "P1",
        role: "anonymous",
        url: "/bayi-basvuru",
        steps: [`Submit application form with email ${email}`],
        expected: "Success / pending notice",
        actual: body.slice(0, 250),
      });
    }
  }
});

const DEALER_CASES = [
  { status: "PENDING", email: "qa-fixture-pending@qa.local", shouldSeeDealerPrice: false, expectNotice: /inceleniyor|onay bekliyor|pending|basvuru/i },
  { status: "APPROVED", email: "qa-fixture-approved@qa.local", shouldSeeDealerPrice: true, expectNotice: null },
  { status: "REJECTED", email: "qa-fixture-rejected@qa.local", shouldSeeDealerPrice: false, expectNotice: /reddedildi|rejected|onaylanma/i },
  { status: "SUSPENDED", email: "qa-fixture-suspended@qa.local", shouldSeeDealerPrice: false, expectNotice: /askiya|suspended|durdurul/i },
] as const;

for (const c of DEALER_CASES) {
  test(`cross-dealer: ${c.status} dealer — pricing visibility & status notice`, async ({
    page,
    request,
  }, testInfo) => {
    const env = await detectMasterEducationServer(request);
    if (!env.ok) { test.skip(true, env.reason); return; }

    await loginAs(page, c.email);
    // Hard-fail check: did login work at all (suspended may block login)
    const stillOnLogin = /\/giris/.test(page.url());
    if (c.status === "SUSPENDED" && !stillOnLogin) {
      // Suspended login allowed - note as informational only if no notice shown later
    }
    if (c.status === "APPROVED" && stillOnLogin) {
      rec({
        title: "APPROVED dealer fixture cannot log in",
        category: "logic",
        severity: "P0",
        role: `dealer-${c.status.toLowerCase()}`,
        url: "/giris",
        steps: [`Login as ${c.email}`],
        expected: "Login succeeds",
        actual: "Stayed on /giris",
      });
      return;
    }

    // Visit /bayi dashboard for status notice
    await page.goto("/bayi", { waitUntil: "domcontentloaded" }).catch(() => {});
    const dashBody = await page.locator("body").innerText().catch(() => "");
    if (c.expectNotice && !c.expectNotice.test(dashBody)) {
      rec({
        title: `${c.status} dealer /bayi page lacks status notice (pattern ${c.expectNotice.source})`,
        category: "ui",
        severity: "P1",
        role: `dealer-${c.status.toLowerCase()}`,
        url: "/bayi",
        steps: [`Login as ${c.email}`, "GET /bayi"],
        expected: `Body matches ${c.expectNotice.source}`,
        actual: dashBody.slice(0, 200),
        suggested_fix: "Show clear status banner on /bayi for non-APPROVED dealers",
      });
    }

    // Walk to product detail and check pricing
    await page.goto("/urunler");
    const firstCard = page.locator('a[href*="/urunler/"]').first();
    await firstCard.waitFor({ timeout: 10_000 }).catch(() => {});
    if (!(await firstCard.count())) {
      rec({
        title: `${c.status} dealer: /urunler shows no product cards`,
        category: "logic",
        severity: "P1",
        role: `dealer-${c.status.toLowerCase()}`,
        url: "/urunler",
        steps: [`Login as ${c.email}`, "GET /urunler"],
        expected: ">=1 product card",
        actual: "0 cards",
      });
      return;
    }
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");
    const { hasDealerPrice, bodyPreview } = await extractDealerPriceSignal(page);

    if (c.shouldSeeDealerPrice && !hasDealerPrice) {
      await takeEvidenceScreenshot(page, testInfo, `${c.status}-no-dealer-price`).catch(() => {});
      rec({
        title: `APPROVED dealer does NOT see dealer pricing on product detail`,
        category: "logic",
        severity: "P0",
        role: `dealer-${c.status.toLowerCase()}`,
        url: page.url(),
        steps: [`Login as ${c.email}`, "Open first product detail", "Look for 'Bayi Fiyat' label"],
        expected: "Dealer pricing label visible",
        actual: bodyPreview,
        suggested_fix: "Verify dealer-pricing render path: session.dealer.status === APPROVED",
      });
    } else if (!c.shouldSeeDealerPrice && hasDealerPrice) {
      rec({
        title: `${c.status} dealer SEES dealer pricing (should be hidden)`,
        category: "security",
        severity: "P0",
        role: `dealer-${c.status.toLowerCase()}`,
        url: page.url(),
        steps: [`Login as ${c.email}`, "Open first product detail"],
        expected: "Dealer pricing hidden for non-APPROVED",
        actual: bodyPreview,
        suggested_fix: "Gate dealer-price block behind status === APPROVED in product detail component",
      });
    }

    // For APPROVED — verify cart picks up dealer price
    if (c.status === "APPROVED") {
      const addToCart = page.getByRole("button", { name: /(sepete ekle|add to cart)/i }).first();
      if (await addToCart.count()) {
        await addToCart.click().catch(() => {});
        await page.goto("/sepet");
        const cartBody = await page.locator("body").innerText().catch(() => "");
        if (!/bayi/i.test(cartBody) && !/iskonto|indirim|net/i.test(cartBody)) {
          rec({
            title: "APPROVED dealer cart does not surface dealer pricing label",
            category: "ui",
            severity: "P2",
            role: "dealer-approved",
            url: "/sepet",
            steps: ["APPROVED dealer adds to cart", "GET /sepet"],
            expected: "Cart shows dealer/iskonto label or net price",
            actual: cartBody.slice(0, 220),
          });
        }
      }
    }
  });
}
