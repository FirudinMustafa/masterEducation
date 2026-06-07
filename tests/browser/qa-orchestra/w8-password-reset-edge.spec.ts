/**
 * W8 — password reset edge cases.
 *
 *   1. Request reset (generic 200 — email enumeration guard).
 *   2. Reuse a previously-used token → 400.
 *   3. Use an expired token → 400.
 *   4. Use another user's token on this user → 400 (since token is hash-keyed
 *      and tied to userId via record.userId, replay across users impossible
 *      unless they share the same plaintext token — vanishingly small).
 *
 * Burada hızlı varyant: invalid + reused token testleri API-seviyesinde,
 * herhangi bir geçerli token gerekmiyor.
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
} from "./_helpers";

test("W8: /api/auth/reset-password rejects invalid token", async ({ request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not Master Education (W8 cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
      workflow: "W8",
    });
    test.skip(true, env.reason);
    return;
  }

  const r1 = await request.post("/api/auth/reset-password", {
    data: { token: "INVALID-W8-XYZ", password: "Test1234!ab" },
    failOnStatusCode: false,
  });
  expect.soft([400, 429]).toContain(r1.status());
  if (![400, 429].includes(r1.status())) {
    recordFinding({
      title: "W8: invalid reset-password token did not return 400",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/auth/reset-password",
      steps: [`POST {token:'INVALID-W8-XYZ'}`, `Status ${r1.status()}`],
      expected: "400 'Baglanti gecersiz veya suresi dolmus.'",
      actual: `${r1.status()}: ${(await r1.text()).slice(0, 160)}`,
      workflow: "W8",
    });
  }
});

test("W8: /api/auth/forgot-password returns generic response (no email enumeration)", async ({
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    test.skip(true, env.reason);
    return;
  }
  // Use a definitely non-existent email
  const fakeEmail = `nonexistent-${Date.now()}@nope.invalid`;
  const r = await request.post("/api/auth/forgot-password", {
    data: { email: fakeEmail },
    failOnStatusCode: false,
  });
  expect.soft([200, 202, 429]).toContain(r.status());
  const body = await r.text();
  // Should NOT leak "user not found"
  if (/user not found|kullanici bulunamadi|kullanıcı bulunamadı/i.test(body)) {
    recordFinding({
      title: "W8: /api/auth/forgot-password leaks user-existence info",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/auth/forgot-password",
      steps: [`POST {email: ${fakeEmail}}`, "Inspect body"],
      expected: "Generic 'check your email' message regardless of whether user exists",
      actual: body.slice(0, 200),
      workflow: "W8",
    });
  }
});

test("W8: reused token (simulated) — invalid token replay returns 400 again, idempotent failure", async ({
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    test.skip(true, env.reason);
    return;
  }
  const token = "REUSED-FAKE-TOKEN-W8";
  const r1 = await request.post("/api/auth/reset-password", {
    data: { token, password: "Test1234!ab" },
    failOnStatusCode: false,
  });
  const r2 = await request.post("/api/auth/reset-password", {
    data: { token, password: "Test1234!ab" },
    failOnStatusCode: false,
  });
  expect.soft(r1.status()).toBe(r2.status());
  // Both should be 400 (or 429 if rate-limited)
  expect.soft([400, 429]).toContain(r1.status());
});
