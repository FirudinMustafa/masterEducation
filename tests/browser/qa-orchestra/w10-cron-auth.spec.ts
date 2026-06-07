/**
 * W10 — /api/cron/* Bearer auth.
 *
 * Her cron endpoint için:
 *   - Bearer yok                → 401
 *   - Yanlış Bearer             → 401
 *   - Doğru Bearer (CRON_SECRET) → 200 ve ikinci çağrıda idempotent
 *
 * NOT: CRON_SECRET env yoksa endpoint 503 döner — bu durumda biz bunu
 * 'kapalı' kabul edip 401 testlerini koşarız (Bearer yoksa 503 de kabul).
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
} from "./_helpers";

const CRON_ENDPOINTS = [
  "/api/cron/cleanup-payment-sessions",
  "/api/cron/cleanup-audit-logs",
  "/api/cron/cleanup-reset-tokens",
  "/api/cron/sync-shipping-tracking",
  "/api/cron/retry-invoices",
  "/api/cron/low-stock-alert",
];

const CRON_SECRET = process.env.CRON_SECRET ?? "";

for (const endpoint of CRON_ENDPOINTS) {
  test(`W10 ${endpoint}: no Bearer → 401 (or 503 if CRON_SECRET unset)`, async ({
    request,
  }) => {
    const env = await detectMasterEducationServer(request);
    if (!env.ok) {
      recordFinding({
        title: `Dev server is not Master Education (W10 ${endpoint} cannot run)`,
        category: "test-env-gap",
        severity: "P0",
        role: "system",
        url: "/api/health",
        steps: [`GET /api/health → ${env.reason}`],
        expected: "Master Education app",
        actual: env.reason ?? "unknown",
        workflow: "W10",
      });
      test.skip(true, env.reason);
      return;
    }

    const res = await request.get(endpoint, { failOnStatusCode: false });
    expect.soft([401, 503]).toContain(res.status());
    if (![401, 503].includes(res.status())) {
      recordFinding({
        title: `W10: ${endpoint} accessible without Bearer (got ${res.status()})`,
        category: "security",
        severity: "P0",
        role: "anonymous",
        url: endpoint,
        steps: ["GET without Authorization header", `Status ${res.status()}`],
        expected: "401 MISSING_BEARER or 503 CRON_NOT_CONFIGURED",
        actual: `${res.status()}: ${(await res.text()).slice(0, 160)}`,
        workflow: "W10",
      });
    }
  });

  test(`W10 ${endpoint}: wrong Bearer → 401`, async ({ request }) => {
    const env = await detectMasterEducationServer(request);
    if (!env.ok) {
      test.skip(true, env.reason);
      return;
    }
    const res = await request.get(endpoint, {
      headers: { Authorization: "Bearer this-is-a-wrong-secret-12345678" },
      failOnStatusCode: false,
    });
    expect.soft([401, 503]).toContain(res.status());
    if (![401, 503].includes(res.status())) {
      recordFinding({
        title: `W10: ${endpoint} accepts wrong Bearer (${res.status()})`,
        category: "security",
        severity: "P0",
        role: "attacker",
        url: endpoint,
        steps: [`GET with Authorization: Bearer wrong-secret`, `Status ${res.status()}`],
        expected: "401 INVALID_TOKEN",
        actual: `${res.status()}: ${(await res.text()).slice(0, 160)}`,
        workflow: "W10",
      });
    }
  });

  test(`W10 ${endpoint}: correct Bearer → 200 + idempotent on second call`, async ({
    request,
  }) => {
    const env = await detectMasterEducationServer(request);
    if (!env.ok) {
      test.skip(true, env.reason);
      return;
    }
    if (!CRON_SECRET) {
      recordFinding({
        title: `W10: CRON_SECRET not set, cannot verify '${endpoint}' success path`,
        category: "test-env-gap",
        severity: "P2",
        role: "system",
        url: endpoint,
        steps: ["Read process.env.CRON_SECRET"],
        expected: "Non-empty CRON_SECRET >= 16 chars",
        actual: "empty",
        suggested_fix: "Set CRON_SECRET in .env.local for QA runs.",
        workflow: "W10",
      });
      test.skip(true, "CRON_SECRET unset");
      return;
    }
    const r1 = await request.get(endpoint, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      failOnStatusCode: false,
    });
    expect.soft(r1.status()).toBe(200);
    const r2 = await request.get(endpoint, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      failOnStatusCode: false,
    });
    expect.soft(r2.status()).toBe(200);
    // Idempotency: second call should not error (status both 200)
    if (r1.status() !== 200 || r2.status() !== 200) {
      recordFinding({
        title: `W10: ${endpoint} not idempotent or failed with correct Bearer`,
        category: "logic",
        severity: "P1",
        role: "system",
        url: endpoint,
        steps: [`First call: ${r1.status()}`, `Second call: ${r2.status()}`],
        expected: "Both calls return 200",
        actual: `${r1.status()} / ${r2.status()}`,
        workflow: "W10",
      });
    }
  });
}
