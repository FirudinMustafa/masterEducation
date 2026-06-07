/**
 * W19 — Hesap silme tam yol.
 *
 * - /hesabim/hesabi-sil form var mi?
 * - "HESABIMI SIL" yazi guard'i UI'da gorunuyor mu (typed-confirm)?
 * - POST /api/account/delete password + phrase olmadan reddediliyor mu?
 * - Silme sonrasi User PII anonimize ediliyor mu (KVKK m.7)?
 */
import { test, expect } from "@playwright/test";
import {
  detectMasterEducationServer,
  recordFinding,
  uniqueEmail,
  readUserPiiSnapshot,
  takeEvidenceScreenshot,
} from "./_helpers";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";

const PASSWORD = "DeleteMe2026!";

async function createAndLogin(page: import("@playwright/test").Page, email: string) {
  // Direct DB insert via tsx so we skip email verification
  const hash = await bcrypt.hash(PASSWORD, 10);
  const script = `
    import { PrismaClient } from "@prisma/client";
    const p = new PrismaClient();
    (async () => {
      await p.user.create({
        data: {
          email: ${JSON.stringify(email)},
          passwordHash: ${JSON.stringify(hash)},
          name: "Delete Test User",
          role: "CUSTOMER",
          emailVerified: new Date(),
        },
      });
      console.log("OK");
    })().catch(e => { console.error(e); process.exit(2); });
  `;
  execSync(`npx tsx -e ${JSON.stringify(script)}`, { encoding: "utf8", timeout: 30_000 });
  await page.goto("/giris");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /(giris|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 10_000 }).catch(() => {});
}

test("W19: /api/account/delete rejects missing password", async ({ request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const res = await request.post("/api/account/delete", {
    data: { confirm: "HESABIMI SIL" },
    failOnStatusCode: false,
  });
  if (res.status() < 400) {
    recordFinding({
      title: "W19: POST /api/account/delete accepted without password",
      category: "security",
      severity: "P0",
      role: "customer",
      url: "/api/account/delete",
      steps: ["POST /api/account/delete with confirm but no password"],
      expected: "400/401 — password is required",
      actual: `HTTP ${res.status()}`,
      suggested_fix: "Reject if password field missing/empty in route handler",
      workflow: "W19",
    });
  }
});

test("W19: /api/account/delete rejects missing or wrong confirm phrase", async ({ request }) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const res = await request.post("/api/account/delete", {
    data: { password: "anything", confirm: "WRONG_PHRASE" },
    failOnStatusCode: false,
  });
  if (res.status() < 400) {
    recordFinding({
      title: "W19: /api/account/delete accepts wrong confirm phrase",
      category: "security",
      severity: "P0",
      role: "customer",
      url: "/api/account/delete",
      steps: ["POST /api/account/delete with confirm='WRONG_PHRASE'"],
      expected: "400 — confirm phrase must match 'HESABIMI SIL'",
      actual: `HTTP ${res.status()}`,
      suggested_fix: "Validate confirm === 'HESABIMI SIL' (case-sensitive) in route handler",
      workflow: "W19",
    });
  }
});

test("W19: full account deletion E2E with PII anonymization", async ({ page, request }, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const email = uniqueEmail("qa-delete");
  await createAndLogin(page, email);

  // Snapshot PII before delete
  const before = readUserPiiSnapshot(email);
  if (!before) {
    recordFinding({
      title: "W19: Could not snapshot user before delete",
      category: "test-env-gap",
      severity: "P2",
      role: "system",
      url: "/api/account/delete",
      steps: [`Created user ${email}`, "Tried to read via readUserPiiSnapshot"],
      expected: "User row found",
      actual: "null returned",
      workflow: "W19",
    });
    return;
  }

  await page.goto("/hesabim/hesabi-sil", { waitUntil: "domcontentloaded" });
  await takeEvidenceScreenshot(page, testInfo, "delete-page");

  // Look for the typed-confirm phrase guard on page
  const pageText = await page.textContent("body").catch(() => "") ?? "";
  if (!/HESABIMI SIL/.test(pageText)) {
    recordFinding({
      title: "W19: /hesabim/hesabi-sil does not display literal 'HESABIMI SIL' phrase guard",
      category: "ui",
      severity: "P1",
      role: "customer",
      url: "/hesabim/hesabi-sil",
      steps: ["GET /hesabim/hesabi-sil"],
      expected: "Page mentions literal 'HESABIMI SIL' as typed-confirm requirement",
      actual: "Phrase not found in body text",
      suggested_fix: "Add visible instruction text + input requiring exact phrase 'HESABIMI SIL'",
      workflow: "W19",
    });
  }

  // Submit delete via API (don't rely on UI for this scenario)
  const csrfRes = await request.get("/api/auth/csrf");
  const csrfBody = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
  const delRes = await request.post("/api/account/delete", {
    data: { password: PASSWORD, confirm: "HESABIMI SIL" },
    headers: csrfBody.csrfToken ? { "x-csrf-token": csrfBody.csrfToken } : {},
    failOnStatusCode: false,
  });

  if (delRes.status() >= 400) {
    recordFinding({
      title: `W19: Valid delete request returned HTTP ${delRes.status()}`,
      category: "logic",
      severity: "P1",
      role: "customer",
      url: "/api/account/delete",
      steps: ["POST /api/account/delete with valid password + confirm phrase"],
      expected: "200 OK + user PII anonymized",
      actual: `HTTP ${delRes.status()}, body: "${(await delRes.text().catch(() => "")).slice(0, 200)}"`,
      workflow: "W19",
    });
    return;
  }

  // Snapshot PII after delete
  await new Promise((r) => setTimeout(r, 1000));
  const after = readUserPiiSnapshot(email);

  if (after && after.email === email) {
    recordFinding({
      title: "W19: User email NOT anonymized after delete (KVKK m.7 leak)",
      category: "security",
      severity: "P0",
      role: "customer",
      url: "/api/account/delete",
      steps: [`Created user ${email}`, "POST /api/account/delete (success)", "Re-query user by original email"],
      expected: "Email scrubbed (e.g. deleted-${id}@anon.local) or user row hard-deleted",
      actual: `User row still findable by original email ${email}; name=${after.name}, phone=${after.phone}`,
      suggested_fix: "Hash/null email + name + phone on delete (or hard-delete); see src/lib/account-cleanup.ts",
      workflow: "W19",
    });
  }
});
