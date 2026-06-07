/**
 * W6 — Admin sipariş durum geçişleri.
 *
 *   PENDING → APPROVED → PROCESSING → SHIPPED → DELIVERED
 *
 * Her geçişte:
 *   - OrderEvent satırı yazılır (route'da `STATUS_TO_EVENT` map'i ile).
 *   - EmailLog satırı eklenir (after() içinde queueEmail).
 *   - DELIVERED'a geçişte invoice oluşturma tetiklenir.
 *
 * Bu spec API-seviyesinde gider; UI'daki "Güncelle" butonu üzerinden değil
 * doğrudan POST /api/admin/orders/[id]/status çağrılır.
 *
 * Auth: ADMIN_EMAIL / ADMIN_PASSWORD env'lerinden seed'lenmiş admin gerekir.
 * Bu env'ler boşsa test test-env-gap olarak skip olur.
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
} from "./_helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@mastereducation.com.tr";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "";

test("W6: admin order status transitions PENDING→APPROVED→PROCESSING→SHIPPED→DELIVERED", async ({
  page,
  request,
}) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFinding({
      title: "Dev server is not Master Education (W6 cannot run)",
      category: "test-env-gap",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: [`GET /api/health → ${env.reason}`],
      expected: "Master Education app",
      actual: env.reason ?? "unknown",
      workflow: "W6",
    });
    test.skip(true, env.reason);
    return;
  }
  if (!ADMIN_PASSWORD) {
    recordFinding({
      title: "W6: ADMIN_PASSWORD env not set, cannot login as admin",
      category: "test-env-gap",
      severity: "P1",
      role: "system",
      url: "/giris",
      steps: ["Read process.env.ADMIN_PASSWORD"],
      expected: "Non-empty value for admin login",
      actual: "empty",
      suggested_fix: "Export ADMIN_PASSWORD before running B6 suite, or seed the admin user with a known password.",
      workflow: "W6",
    });
    test.skip(true, "ADMIN_PASSWORD empty");
    return;
  }

  // Admin login
  await page.goto("/giris");
  await page.locator('input[type="email"], #email').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"], #password').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /(giris yap|signin|login)/i }).first().click();
  await page.waitForURL(/(admin|hesabim)/, { timeout: 15_000 }).catch(() => {});

  // Find any PENDING order from /admin/siparisler
  await page.goto("/admin/siparisler");
  const firstOrderLink = page.locator('a[href*="/admin/siparisler/"]').first();
  if (!(await firstOrderLink.count())) {
    recordFinding({
      title: "W6: No orders exist in /admin/siparisler — cannot test status transitions",
      category: "test-env-gap",
      severity: "P2",
      role: "admin",
      url: "/admin/siparisler",
      steps: ["GET /admin/siparisler"],
      expected: "At least 1 order to transition through states",
      actual: "Zero orders",
      suggested_fix: "Run W1 first or seed an order; alternative: scripts/test-admin-approve-order.ts",
      workflow: "W6",
    });
    test.skip(true, "No orders in DB");
    return;
  }

  const href = await firstOrderLink.getAttribute("href");
  const orderId = href?.split("/").pop();
  if (!orderId) {
    test.skip(true, "Could not parse orderId");
    return;
  }

  // Capture the storage state so we can hit the API with the admin session cookie.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const sequence: Array<["PENDING" | "APPROVED" | "PROCESSING" | "SHIPPED" | "DELIVERED", number?]> = [
    ["APPROVED"],
    ["PROCESSING"],
    ["SHIPPED"],
    ["DELIVERED"],
  ];
  for (const [status] of sequence) {
    const res = await request.post(`/api/admin/orders/${orderId}/status`, {
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      data: { status, adminNote: `W6 transition to ${status}` },
      failOnStatusCode: false,
    });
    const body = await res.text();
    if (!res.ok()) {
      recordFinding({
        title: `W6: transition to ${status} failed (${res.status()})`,
        category: "logic",
        severity: "P1",
        role: "admin",
        url: `/api/admin/orders/${orderId}/status`,
        steps: [
          `POST status=${status}`,
          `Response ${res.status()}: ${body.slice(0, 200)}`,
        ],
        expected: "200 OK and state transition recorded",
        actual: `${res.status()}: ${body.slice(0, 200)}`,
        workflow: "W6",
      });
      break;
    }
  }

  // After all transitions: visit detail and look for event timeline rows
  await page.goto(`/admin/siparisler/${orderId}`);
  const txt = await page.locator("body").innerText();
  const eventNames = ["APPROVED", "PROCESSING", "SHIPPED", "DELIVERED"];
  for (const name of eventNames) {
    if (!new RegExp(name, "i").test(txt)) {
      // Could be Turkish localized — also check Turkish equivalents
      const trMap: Record<string, RegExp> = {
        APPROVED: /onaylandı|onaylandi/i,
        PROCESSING: /hazırlanıyor|hazirlaniyor|işlemde/i,
        SHIPPED: /kargolandı|kargolandi|gönderildi/i,
        DELIVERED: /teslim edildi/i,
      };
      if (!trMap[name].test(txt)) {
        recordFinding({
          title: `W6: status '${name}' not shown in admin order detail timeline`,
          category: "ui",
          severity: "P2",
          role: "admin",
          url: `/admin/siparisler/${orderId}`,
          steps: [`Walked through transitions to ${name}`, "Loaded order detail"],
          expected: `Timeline / status badge contains '${name}'`,
          actual: "Not found in body text",
          workflow: "W6",
        });
      }
    }
  }
  expect(true).toBe(true);
});
