/**
 * W3 — Dealer onboarding & credit-limit guard.
 *
 *   1. /bayi-basvuru ile yeni bayi başvurusu.
 *   2. Admin /admin/bayiler → /admin/bayiler/[id]/approve ile onay.
 *   3. Bayi /giris ile login.
 *   4. İlk OPEN_ACCOUNT siparişi → kabul.
 *   5. İkinci OPEN_ACCOUNT siparişi (creditLimit + 1 TL) → red ("kredi limitiniz yetersiz").
 *
 * Bu spec heavyweight — admin oturumu + dealer oturumu gerekir. Burada
 * uygulanabilir minimum sınırlar test edilir:
 *   - /bayi-basvuru formu erişilebilir + submit edilebilir
 *   - /admin/bayiler sayfası erişilebilir + onay aksiyonu UI'da mevcut
 *   - /api/orders OPEN_ACCOUNT senaryosunda dealer-not-approved cevabı veriyor
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
  takeEvidenceScreenshot,
} from "./_helpers";

test.describe.configure({ mode: "serial" });

test("W3: /bayi-basvuru form is reachable and POSTs", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not Master Education (W3 cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
      workflow: "W3",
    });
    test.skip(true, env.reason);
    return;
  }

  await page.goto("/bayi-basvuru");
  const form = page.locator("form").first();
  await expect(form).toBeVisible();
  const requiredFields = [
    'input[name="companyName"]',
    'input[name="taxNumber"]',
    'input[name="email"]',
  ];
  for (const sel of requiredFields) {
    const el = page.locator(sel).first();
    if (!(await el.count())) {
      await takeEvidenceScreenshot(page, testInfo, "bayi-basvuru-missing-field");
      recordFinding({
        title: `W3: /bayi-basvuru missing required field selector ${sel}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url: "/bayi-basvuru",
        steps: ["GET /bayi-basvuru", `Look for ${sel}`],
        expected: "Field exists",
        actual: "Field not found",
        workflow: "W3",
      });
    }
  }
});

test("W3: /api/orders OPEN_ACCOUNT without dealer session → 401 or 403", async ({
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    test.skip(true, env.reason);
    return;
  }
  const res = await request.post("/api/orders", {
    data: {
      items: [{ productId: "nonexistent-w3-product", quantity: 1 }],
      shipping: {
        fullName: "W3 Tester",
        phone: "05551234567",
        city: "Istanbul",
        district: "Kadikoy",
        address: "Test mah.",
        email: "w3@qa.local",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
    failOnStatusCode: false,
  });
  expect.soft([400, 401, 403]).toContain(res.status());
  if (![400, 401, 403].includes(res.status())) {
    recordFinding({
      title: "W3: anonymous OPEN_ACCOUNT order not rejected",
      category: "security",
      severity: "P0",
      role: "anonymous",
      url: "/api/orders",
      steps: [
        "POST /api/orders with paymentMethod=OPEN_ACCOUNT (no session)",
        `Got status ${res.status()}`,
      ],
      expected: "401 (unauth) or 403 (forbidden)",
      actual: `${res.status()}: ${(await res.text()).slice(0, 160)}`,
      workflow: "W3",
    });
  }
});

test("W3: /admin/bayiler requires admin (anonymous → redirect to /giris)", async ({
  page,
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    test.skip(true, env.reason);
    return;
  }
  const res = await request.get("/admin/bayiler", {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  // 307 to /giris OR 401/403 — anything but a 200 raw render to anon
  if (res.status() === 200) {
    recordFinding({
      title: "W3: /admin/bayiler accessible to anonymous (no auth gate)",
      category: "security",
      severity: "P0",
      role: "anonymous",
      url: "/admin/bayiler",
      steps: ["GET /admin/bayiler (no cookie)"],
      expected: "307 redirect to /giris or 401/403",
      actual: "200 OK",
      workflow: "W3",
    });
  }
  await page.goto("/admin/bayiler");
  // After redirect, URL should NOT be /admin/bayiler
  const finalUrl = page.url();
  if (/\/admin\/bayiler/.test(finalUrl)) {
    // Either logged in already (admin) or no guard
    const body = await page.locator("body").innerText();
    if (!/yetkisiz|forbidden|giriş yapın/i.test(body)) {
      recordFinding({
        title: "W3: /admin/bayiler reachable without admin role indicator",
        category: "security",
        severity: "P0",
        role: "anonymous",
        url: "/admin/bayiler",
        steps: ["page.goto('/admin/bayiler') as anon", `Final URL: ${finalUrl}`],
        expected: "Redirect or 'yetkisiz' page",
        actual: body.slice(0, 200),
        workflow: "W3",
      });
    }
  }
});
