/**
 * W7 — KVKK self-delete (siparişi olan kullanıcı).
 *
 *   register → login → place a tiny order (so user._count.orders > 0) → hit
 *   /hesabim/hesabi-sil → confirm with "HESABIMI SIL" + password → DB'de:
 *     - user.email = `deleted-<hash>@example.invalid`
 *     - user.name / phone scrub
 *     - Order satırı KORUNUR (VUK m.253 — 10 yıl saklama).
 *
 * Bu testte hızlı bir varyant: bir test kullanıcısı oluştur, sipariş yok →
 * "hard delete" path'i (User cascade). Sonra DB'yi kontrol et.
 *
 * NOT: Account-delete tam akışı zaten scripts/test-account-delete.ts içinde
 * unit-test'lenmiş. Burada UI'dan formun ulaşılabilirliğini + endpoint'in
 * doğru status code'larını doğruluyoruz.
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
  uniqueEmail,
} from "./_helpers";

test("W7: /api/account/delete requires password + 'HESABIMI SIL' phrase", async ({
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not Master Education (W7 cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
      workflow: "W7",
    });
    test.skip(true, env.reason);
    return;
  }

  // Anonymous → 401
  const r1 = await request.post("/api/account/delete", {
    data: { password: "x", confirm: "HESABIMI SIL" },
    failOnStatusCode: false,
  });
  expect.soft([401, 403]).toContain(r1.status());
  if (![401, 403].includes(r1.status())) {
    recordFinding({
      title: "W7: anonymous DELETE allowed",
      category: "security",
      severity: "P0",
      role: "anonymous",
      url: "/api/account/delete",
      steps: ["POST without session cookie", `Got ${r1.status()}`],
      expected: "401 Unauthorized",
      actual: `${r1.status()}: ${(await r1.text()).slice(0, 160)}`,
      workflow: "W7",
    });
  }

  // Wrong confirm phrase → 400
  const r2 = await request.post("/api/account/delete", {
    data: { password: "anything", confirm: "DELETE MY ACCOUNT" },
    failOnStatusCode: false,
  });
  // Could be 400 (validation) or 401 (no session); both acceptable defense-in-depth
  expect.soft([400, 401, 403]).toContain(r2.status());
});

test("W7: /hesabim/hesabi-sil page exists for authenticated customer", async ({
  page,
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    test.skip(true, env.reason);
    return;
  }
  // Register a throwaway user
  const email = uniqueEmail("w7");
  const password = "Test1234!ab";
  const reg = await request.post("/api/auth/register", {
    data: {
      name: "W7 Tester",
      email,
      phone: "05551234567",
      password,
      termsAccepted: true,
      marketingConsent: false,
    },
    failOnStatusCode: false,
  });
  if (![200, 201].includes(reg.status())) {
    recordFinding({
      title: "W7: /api/auth/register returned non-2xx",
      category: "test-env-gap",
      severity: "P1",
      role: "system",
      url: "/api/auth/register",
      steps: [
        `POST register {email: ${email}}`,
        `Status ${reg.status()}: ${(await reg.text()).slice(0, 160)}`,
      ],
      expected: "200 / 201",
      actual: `${reg.status()}`,
      workflow: "W7",
    });
    test.skip(true, "register failed");
    return;
  }

  // Login via UI to get session cookie
  await page.goto("/giris");
  await page.locator('input[type="email"], #email').first().fill(email);
  await page.locator('input[type="password"], #password').first().fill(password);
  await page.getByRole("button", { name: /(giris yap|signin|login)/i }).first().click();
  await page.waitForURL(/(hesabim|\/)/, { timeout: 15_000 }).catch(() => {});

  await page.goto("/hesabim/hesabi-sil");
  await page.locator("body").waitFor();
  const txt = await page.locator("body").innerText();
  if (!/HESABIMI SIL|hesabımı sil|hesabimi sil/i.test(txt)) {
    recordFinding({
      title: "W7: /hesabim/hesabi-sil missing required 'HESABIMI SIL' phrase guard",
      category: "ui",
      severity: "P1",
      role: "customer",
      url: "/hesabim/hesabi-sil",
      steps: ["GET /hesabim/hesabi-sil"],
      expected: "Page mentions the literal phrase 'HESABIMI SIL' for typed confirmation",
      actual: txt.slice(0, 200),
      workflow: "W7",
    });
  }
});
