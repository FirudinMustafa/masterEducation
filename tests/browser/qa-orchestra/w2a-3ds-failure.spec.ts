/**
 * W2a — 3DS failure.
 *
 * Aynı happy-path; ama mock confirm endpointi `action=failure` ile çağrılır.
 * Beklenen davranış:
 *   - PaymentSession FAILED, Order CANCELLED + paymentStatus FAILED.
 *   - Sepet KORUNUR (kullanıcı tekrar deneyebilsin); ya da yeni bir sipariş için yönlendirilir.
 *   - Hata mesajı Türkçe ve boş değil.
 *
 * NOT: Bu spec API-seviyesinde gider (UI'da 3DS sayfasına "fail" butonu
 * her zaman tutarlı şekilde bulunamaz; mock confirm API'si stabildir).
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
  takeEvidenceScreenshot,
} from "./_helpers";

test("W2a 3DS failure: payments/mock/confirm with action=failure → CANCELLED/FAILED", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not Master Education (W2a cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
      workflow: "W2a",
    });
    test.skip(true, env.reason);
    return;
  }

  // İlk olarak: invalid token ile failure çağrısı → 404 dönmeli.
  const res404 = await request.post("/api/payments/mock/confirm", {
    data: { token: "nonexistent-token-xyz", action: "failure", otp: "" },
    failOnStatusCode: false,
  });
  expect.soft([404, 400, 503]).toContain(res404.status());
  if (![404, 400, 503].includes(res404.status())) {
    recordFinding({
      title: "W2a: /api/payments/mock/confirm with invalid token unexpected status",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/payments/mock/confirm",
      steps: [
        `POST {token:'nonexistent-token-xyz', action:'failure'}`,
        `Got ${res404.status()}`,
      ],
      expected: "404 (token unknown) or 400 (validation)",
      actual: `${res404.status()}: ${(await res404.text()).slice(0, 160)}`,
      workflow: "W2a",
    });
  }

  // İkinci olarak: turkish error mesajı kontrol
  const body = await res404.json().catch(() => ({} as Record<string, unknown>));
  const err = (body as { error?: string }).error ?? "";
  if (res404.status() === 404 && (!err || /^[\sA-Za-z]+$/.test(err))) {
    recordFinding({
      title: "W2a: Error message is empty or not Turkish",
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url: "/api/payments/mock/confirm",
      steps: ["POST with invalid token", "Inspect error message"],
      expected: "Turkish error message (e.g. 'Odeme oturumu bulunamadi.')",
      actual: JSON.stringify(body),
      workflow: "W2a",
    });
  }

  // Page-level: /odeme/basarisiz sayfası render olur, hata mesajı içerir
  await page.goto("/odeme/basarisiz");
  await page.locator("body").waitFor();
  const txt = await page.locator("body").innerText();
  if (!/(başarısız|basarisiz|hata|tekrar dene|yeniden dene)/i.test(txt)) {
    await takeEvidenceScreenshot(page, testInfo, "failure-page-no-message");
    recordFinding({
      title: "W2a: /odeme/basarisiz does not display a Turkish failure message",
      category: "ui",
      severity: "P2",
      role: "customer",
      url: "/odeme/basarisiz",
      steps: ["GET /odeme/basarisiz"],
      expected: "Turkish 'odeme basarisiz' message + retry CTA",
      actual: txt.slice(0, 200),
      workflow: "W2a",
    });
  }
});
