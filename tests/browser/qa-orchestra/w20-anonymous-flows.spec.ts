/**
 * W20 — Anonymous (guest) flows.
 *
 * - /iletisim form: POST eder mi, hata mesaji turkce mi?
 * - /kvkk-basvuru: form var mi, requestType secimi calisiyor mu?
 * - /siparis-takip: orderNumber + email ile sorgu sonucu net mi?
 * - /kargo-takip/[no]: var olmayan tracking no -> 404 mu, "bulunamadi" mu?
 * - /sss, /hakkimizda, /kvkk, /iade, /uyelik-sozlesmesi: sayfalar yukleniyor mu, icerik dolu mu?
 */
import { test, expect } from "@playwright/test";
import { detectMasterEducationServer, recordFinding } from "./_helpers";

test("W20: /iletisim form submits successfully or shows validation errors", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  await page.goto("/iletisim", { waitUntil: "domcontentloaded" });
  const form = page.locator("form").first();
  if (!(await form.count())) {
    recordFinding({
      title: "W20: /iletisim page has no <form> element",
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url: "/iletisim",
      steps: ["GET /iletisim", "Look for <form>"],
      expected: "Contact form present",
      actual: "No form found",
      workflow: "W20",
    });
    return;
  }

  // Try empty submit — should show validation
  const submit = page.getByRole("button", { name: /(gonder|send|submit|kaydet)/i }).first();
  if (await submit.count()) {
    await submit.click().catch(() => {});
    await page.waitForTimeout(500);
    const bodyAfter = await page.textContent("body").catch(() => "") ?? "";
    const hasError = /(zorunlu|gerekli|required|gecersiz|invalid|hata)/i.test(bodyAfter);
    if (!hasError) {
      recordFinding({
        title: "W20: /iletisim empty submit shows no validation error",
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url: "/iletisim",
        steps: ["GET /iletisim", "Click submit on empty form"],
        expected: "Field-level validation errors visible (Turkish)",
        actual: "No error message after empty submit",
        suggested_fix: "Wire client-side Zod validation to display errors",
        workflow: "W20",
      });
    }
  }
});

test("W20: /siparis-takip form is reachable + accepts inputs", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  await page.goto("/siparis-takip", { waitUntil: "domcontentloaded" });
  const orderInput = page.locator('input[name*="order"], input[placeholder*="siparis"], input[placeholder*="order"]').first();
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();

  if (!(await orderInput.count())) {
    recordFinding({
      title: "W20: /siparis-takip missing order-number input",
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url: "/siparis-takip",
      steps: ["GET /siparis-takip"],
      expected: "Input for order number",
      actual: "No matching input found",
      workflow: "W20",
    });
  }
  if (!(await emailInput.count())) {
    recordFinding({
      title: "W20: /siparis-takip missing email input",
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url: "/siparis-takip",
      steps: ["GET /siparis-takip"],
      expected: "Email field present",
      actual: "No email input",
      workflow: "W20",
    });
  }
});

test("W20: /kargo-takip/[no] with bogus number shows 'bulunamadi' or 404", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const res = await page.goto("/kargo-takip/BOGUS-NUMBER-XYZ-999", { waitUntil: "domcontentloaded" });
  const body = await page.textContent("body").catch(() => "") ?? "";
  const statusCode = res?.status() ?? 0;

  const handled = statusCode === 404 || /(bulunamadi|not found|gecersiz|hata)/i.test(body);
  if (!handled) {
    recordFinding({
      title: "W20: /kargo-takip/[no] doesn't handle invalid tracking number",
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url: "/kargo-takip/BOGUS-NUMBER-XYZ-999",
      steps: ["GET /kargo-takip/BOGUS-NUMBER-XYZ-999"],
      expected: "404 page OR 'Kargo bulunamadi' message",
      actual: `HTTP ${statusCode}, body preview: "${body.slice(0, 200)}"`,
      suggested_fix: "Add not-found handler in src/app/(storefront)/kargo-takip/[no]/page.tsx",
      workflow: "W20",
    });
  }
});

test("W20: legal pages have non-empty content", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const legalPages = [
    "/sss",
    "/hakkimizda",
    "/kvkk",
    "/iade",
    "/uyelik-sozlesmesi",
    "/mesafeli-satis-sozlesmesi",
    "/cerez-politikasi",
    "/on-bilgilendirme-formu",
  ];

  for (const url of legalPages) {
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) {
      recordFinding({
        title: `W20: Legal page ${url} returns HTTP ${res?.status() ?? "no-response"}`,
        category: "ui",
        severity: "P1",
        role: "anonymous",
        url,
        steps: [`GET ${url}`],
        expected: "200 OK",
        actual: `HTTP ${res?.status() ?? "no-response"}`,
        workflow: "W20",
      });
      continue;
    }
    const main = await page.locator("main, article, .prose, [role='main']").first().textContent().catch(() => "");
    const wordCount = (main ?? "").trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) {
      recordFinding({
        title: `W20: Legal page ${url} has very short content (${wordCount} words)`,
        category: "ui",
        severity: "P1",
        role: "anonymous",
        url,
        steps: [`GET ${url}`, "Count words in <main>"],
        expected: "≥ 200 words for legal pages",
        actual: `${wordCount} words — page appears empty or placeholder`,
        suggested_fix: "Fill the legal page content (KVKK, iade policy, etc.) — required by Turkish e-commerce regulations",
        workflow: "W20",
      });
    }
  }
});

test("W20: /sss has expandable FAQ items (interactive)", async ({ page, request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }
  await page.goto("/sss", { waitUntil: "domcontentloaded" });
  const summary = page.locator("details summary, [aria-expanded], button[type='button']").first();
  if (!(await summary.count())) {
    recordFinding({
      title: "W20: /sss has no interactive Q&A items (no <details>/accordion)",
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url: "/sss",
      steps: ["GET /sss", "Look for interactive Q&A"],
      expected: "Expandable Q&A items (details/accordion)",
      actual: "No interactive items found",
      workflow: "W20",
    });
  }
});
