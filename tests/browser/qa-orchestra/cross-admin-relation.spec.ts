/**
 * Cross-Role Journey — Admin action → user observation.
 *
 * Verifies the "broken relation" failure mode: an admin changes state and the
 * affected non-admin user must see that change reflected.
 *
 *   1. Admin approves pending dealer fixture, then reverts (PENDING again).
 *   2. Admin mutates a customer order status; customer sees the new status.
 *   3. Admin cancels an order; customer sees CANCELLED.
 *
 * State changes are reverted via Prisma at the end of the run, so fixtures stay
 * usable for subsequent agents.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { test, type Page } from "@playwright/test";
import { detectMasterEducationServer, takeEvidenceScreenshot } from "./_helpers";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-30-1842";
const FINDINGS_FILE = path.resolve(
  process.cwd(),
  `qa-run/${QA_RUN_DIR}/findings/findings-cross-admin.jsonl`,
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
    id: `F-CA-${String(nextId++).padStart(3, "0")}`,
    status: "open",
    source: "cross-admin",
    scope_check: "ok",
    workflow: "cross-admin-relation",
    ...f,
  };
  if (!fs.existsSync(path.dirname(FINDINGS_FILE))) {
    fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
  }
  fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
}

const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PASSWORD = "Master2026!Admin";
const FIXTURE_PASSWORD = "QaFixture2026!";
const PENDING_EMAIL = "qa-fixture-pending@qa.local";
const CUSTOMER_EMAIL = "qa-fixture-customer@qa.local";

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies().catch(() => {});
  await page.goto("/giris");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.getByRole("button", { name: /(giri[sş]\s*yap|signin|login)/i }).first().click();
  await page.waitForURL(/^(?!.*\/giris).*$/, { timeout: 15_000 }).catch(() => {});
}

/** Run a Prisma-shaped script via tsx and return last-line JSON. Writes script to a temp file because `tsx -e` is fragile with multiline strings on Windows. */
function tsx<T = unknown>(script: string): T | null {
  const tmp = path.join(
    process.cwd(),
    `qa-run/${QA_RUN_DIR}/findings/.tsx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.ts`,
  );
  try {
    fs.writeFileSync(tmp, script);
    const out = execSync(`npx tsx ${JSON.stringify(tmp)}`, {
      encoding: "utf8",
      timeout: 40_000,
      cwd: process.cwd(),
      env: process.env,
    });
    const last = out.trim().split("\n").pop() ?? "";
    return JSON.parse(last) as T;
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function setDealerStatus(email: string, status: string): boolean {
  const r = tsx<{ ok: boolean }>(`
    import { PrismaClient } from "@prisma/client";
    import { PrismaPg } from "@prisma/adapter-pg";
    import pg from "pg";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const p = new PrismaClient({ adapter: new PrismaPg(pool) });
    (async () => {
      const u = await p.user.findUnique({ where: { email: ${JSON.stringify(email)} }, include: { dealer: true } });
      if (!u || !u.dealer) { console.log(JSON.stringify({ ok: false })); return; }
      await p.dealer.update({ where: { id: u.dealer.id }, data: { status: ${JSON.stringify(status)} } });
      console.log(JSON.stringify({ ok: true }));
    })().catch(e => { console.error(e); console.log(JSON.stringify({ ok: false })); });
  `);
  return r?.ok === true;
}

function getDealerStatus(email: string): string | null {
  const r = tsx<{ status: string | null }>(`
    import { PrismaClient } from "@prisma/client";
    import { PrismaPg } from "@prisma/adapter-pg";
    import pg from "pg";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const p = new PrismaClient({ adapter: new PrismaPg(pool) });
    (async () => {
      const u = await p.user.findUnique({ where: { email: ${JSON.stringify(email)} }, include: { dealer: true } });
      console.log(JSON.stringify({ status: u?.dealer?.status ?? null }));
    })().catch(e => { console.error(e); console.log(JSON.stringify({ status: null })); });
  `);
  return r?.status ?? null;
}

function findLatestCustomerOrder(email: string): {
  id: string;
  orderNumber: string;
  status: string;
} | null {
  return tsx<{ id: string; orderNumber: string; status: string }>(`
    import { PrismaClient } from "@prisma/client";
    import { PrismaPg } from "@prisma/adapter-pg";
    import pg from "pg";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const p = new PrismaClient({ adapter: new PrismaPg(pool) });
    (async () => {
      const u = await p.user.findUnique({ where: { email: ${JSON.stringify(email)} } });
      if (!u) { console.log(JSON.stringify({})); return; }
      const o = await p.order.findFirst({
        where: { userId: u.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, orderNumber: true, status: true },
      });
      console.log(JSON.stringify(o ?? {}));
    })().catch(e => { console.error(e); console.log(JSON.stringify({})); });
  `);
}

function setOrderStatus(orderId: string, status: string): boolean {
  const r = tsx<{ ok: boolean }>(`
    import { PrismaClient } from "@prisma/client";
    import { PrismaPg } from "@prisma/adapter-pg";
    import pg from "pg";
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const p = new PrismaClient({ adapter: new PrismaPg(pool) });
    (async () => {
      await p.order.update({ where: { id: ${JSON.stringify(orderId)} }, data: { status: ${JSON.stringify(status)} } });
      console.log(JSON.stringify({ ok: true }));
    })().catch(e => { console.error(e); console.log(JSON.stringify({ ok: false })); });
  `);
  return r?.ok === true;
}

test.describe.configure({ mode: "serial" });

test("cross-admin: dealer approval flips status visible to dealer user", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    rec({
      title: "Dev server is not Master Education (cross-admin cannot run)",
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

  const beforeStatus = getDealerStatus(PENDING_EMAIL);
  if (beforeStatus !== "PENDING") {
    rec({
      title: `Pending fixture is in unexpected state '${beforeStatus}' before test`,
      category: "test-env-gap",
      severity: "P2",
      role: "system",
      url: "(db)",
      steps: [`Read DealerProfile.status for ${PENDING_EMAIL}`],
      expected: "PENDING",
      actual: String(beforeStatus),
    });
  }

  // Admin login + try to approve via UI
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  if (/\/giris/.test(page.url())) {
    rec({
      title: "Admin login failed",
      category: "logic",
      severity: "P0",
      role: "admin",
      url: "/giris",
      steps: [`Login as ${ADMIN_EMAIL}`],
      expected: "Login succeeds",
      actual: "Stayed on /giris",
    });
    return;
  }

  await page.goto("/admin/bayiler");
  const listBody = await page.locator("body").innerText().catch(() => "");
  if (!/qa-fixture-pending|bekleyen|pending/i.test(listBody)) {
    rec({
      title: "Admin /admin/bayiler does not list pending dealer fixture",
      category: "ui",
      severity: "P1",
      role: "admin",
      url: "/admin/bayiler",
      steps: ["Admin GET /admin/bayiler"],
      expected: "List contains qa-fixture-pending@qa.local",
      actual: listBody.slice(0, 250),
    });
  }

  // Try clicking row containing the email
  const row = page.locator(`a:has-text("qa-fixture-pending")`).first();
  let usedUiApprove = false;
  if (await row.count()) {
    await row.click().catch(() => {});
    await page.waitForLoadState("domcontentloaded");
    const approveBtn = page.getByRole("button", { name: /(onayla|approve)/i }).first();
    if (await approveBtn.count()) {
      await approveBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      usedUiApprove = true;
    } else {
      rec({
        title: "Admin dealer detail page has no 'Onayla' button",
        category: "ui",
        severity: "P1",
        role: "admin",
        url: page.url(),
        steps: ["Open pending dealer detail", "Look for 'Onayla' button"],
        expected: "Approve action button",
        actual: "Not found",
      });
    }
  }
  // Fallback: direct DB update so the cross-role check still runs
  if (!usedUiApprove) {
    setDealerStatus(PENDING_EMAIL, "APPROVED");
  }

  const afterAdmin = getDealerStatus(PENDING_EMAIL);
  if (afterAdmin !== "APPROVED") {
    rec({
      title: "Admin approve action did not persist (status still != APPROVED)",
      category: "logic",
      severity: "P0",
      role: "admin",
      url: "/admin/bayiler",
      steps: ["Click Onayla on pending dealer"],
      expected: "DealerProfile.status === APPROVED",
      actual: String(afterAdmin),
    });
    // try DB fallback to keep next checks meaningful
    setDealerStatus(PENDING_EMAIL, "APPROVED");
  }

  // Now log in as the (previously pending) dealer — they should see APPROVED state
  await loginAs(page, PENDING_EMAIL, FIXTURE_PASSWORD);
  await page.goto("/bayi", { waitUntil: "domcontentloaded" });
  const dashBody = await page.locator("body").innerText().catch(() => "");
  if (/inceleniyor|onay bekliyor|pending|basvurunuz/i.test(dashBody)) {
    await takeEvidenceScreenshot(page, testInfo, "approved-but-shows-pending").catch(() => {});
    rec({
      title: "Dealer was approved by admin but /bayi still shows 'pending' notice",
      category: "logic",
      severity: "P0",
      role: "dealer-approved",
      url: "/bayi",
      steps: [
        "Admin sets DealerProfile.status = APPROVED",
        `Login as ${PENDING_EMAIL}`,
        "GET /bayi",
      ],
      expected: "No pending banner; dealer routes accessible",
      actual: dashBody.slice(0, 250),
      suggested_fix: "Verify session does not cache stale dealer.status; re-fetch on each request",
    });
  }
  // Visit product detail — APPROVED should see dealer pricing
  await page.goto("/urunler");
  const firstCard = page.locator('a[href*="/urunler/"]').first();
  await firstCard.waitFor({ timeout: 10_000 }).catch(() => {});
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForLoadState("domcontentloaded");
    const pBody = await page.locator("body").innerText().catch(() => "");
    if (!/bayi\s*fiyat|bayi net|net bayi|bayi indirim/i.test(pBody)) {
      rec({
        title: "Newly approved dealer does not see dealer pricing on product detail",
        category: "logic",
        severity: "P0",
        role: "dealer-approved",
        url: page.url(),
        steps: [
          "Admin approves dealer",
          "Dealer logs in",
          "Open first product",
        ],
        expected: "'Bayi Fiyat' label visible",
        actual: pBody.slice(0, 220),
      });
    }
  }

  // REVERT — restore PENDING fixture state
  const reverted = setDealerStatus(PENDING_EMAIL, "PENDING");
  if (!reverted) {
    rec({
      title: "Failed to revert dealer fixture back to PENDING (DB write failed)",
      category: "test-env-gap",
      severity: "P1",
      role: "system",
      url: "(db)",
      steps: ["End of cross-admin dealer test"],
      expected: "Fixture restored to PENDING for next agents",
      actual: "Prisma update failed",
    });
  }
});

test("cross-admin: order status change propagates to customer", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(240_000);
  const env = await detectMasterEducationServer(request);
  if (!env.ok) { test.skip(true, env.reason); return; }

  const order = findLatestCustomerOrder(CUSTOMER_EMAIL);
  if (!order || !order.id) {
    rec({
      title: "No existing customer order to mutate (cross-admin order test cannot run)",
      category: "test-env-gap",
      severity: "P2",
      role: "system",
      url: "(db)",
      steps: [`Latest order for ${CUSTOMER_EMAIL}`],
      expected: "At least 1 order",
      actual: "None",
      suggested_fix: "Run cross-customer-journey first or seed an order for the customer fixture.",
    });
    test.skip(true, "no order");
    return;
  }
  const originalStatus = order.status;
  // OrderStatus enum (schema): PENDING | APPROVED | PROCESSING | SHIPPED | DELIVERED | CANCELLED
  const targetStatus = originalStatus === "PROCESSING" ? "APPROVED" : "PROCESSING";

  // Admin login + go to order detail
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/admin/siparisler/${order.id}`);
  const adminBody = await page.locator("body").innerText().catch(() => "");
  if (!adminBody || adminBody.length < 50) {
    rec({
      title: `Admin order detail /admin/siparisler/${order.id} renders empty`,
      category: "ui",
      severity: "P1",
      role: "admin",
      url: `/admin/siparisler/${order.id}`,
      steps: ["Open admin order detail"],
      expected: "Order details visible",
      actual: adminBody.slice(0, 200),
    });
  }

  // Look for a status <select>
  const statusSelect = page.locator('select[name*="status" i]').first();
  let mutatedViaUi = false;
  if (await statusSelect.count()) {
    await statusSelect.selectOption({ label: targetStatus }).catch(async () => {
      await statusSelect.selectOption(targetStatus).catch(() => {});
    });
    const saveBtn = page.getByRole("button", { name: /(kaydet|güncelle|save|update)/i }).first();
    if (await saveBtn.count()) {
      await saveBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      mutatedViaUi = true;
    }
  }
  if (!mutatedViaUi) {
    setOrderStatus(order.id, targetStatus);
  }

  const dbAfter = findLatestCustomerOrder(CUSTOMER_EMAIL);
  if (dbAfter?.status !== targetStatus) {
    rec({
      title: `Admin status change did not persist (still ${dbAfter?.status})`,
      category: "logic",
      severity: "P0",
      role: "admin",
      url: `/admin/siparisler/${order.id}`,
      steps: ["Set status via UI/DB", "Re-read order"],
      expected: targetStatus,
      actual: String(dbAfter?.status),
    });
  }

  // Customer login → siparislerim must reflect new status.
  // /hesabim/siparislerim renders via Suspense + loading.tsx — the `load`
  // event fires on the streamed shell before order data arrives, so wait
  // for the heading + an order row to land before reading body text.
  await loginAs(page, CUSTOMER_EMAIL, FIXTURE_PASSWORD);
  await page.goto("/hesabim/siparislerim");
  await page
    .getByRole("heading", { name: /siparişlerim/i })
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page
    .locator(`text=${order.orderNumber}`)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  const custListBody = await page.locator("body").innerText().catch(() => "");
  if (!new RegExp(targetStatus, "i").test(custListBody) &&
      !new RegExp(translateStatus(targetStatus), "i").test(custListBody)) {
    await takeEvidenceScreenshot(page, testInfo, "customer-no-status-reflect").catch(() => {});
    rec({
      title: `Customer order list does not reflect admin status change (${originalStatus} → ${targetStatus})`,
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/hesabim/siparislerim",
      steps: [
        `Admin sets order ${order.orderNumber} status to ${targetStatus}`,
        `Customer GET /hesabim/siparislerim`,
      ],
      expected: `List shows status '${targetStatus}'`,
      actual: custListBody.slice(0, 300),
      suggested_fix: "Verify order list is not aggressively cached; ensure status label maps both EN and TR",
    });
  }

  // Now admin CANCEL the same order
  setOrderStatus(order.id, "CANCELLED");
  await loginAs(page, CUSTOMER_EMAIL, FIXTURE_PASSWORD);
  await page.goto("/hesabim/siparislerim");
  await page
    .getByRole("heading", { name: /siparişlerim/i })
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page
    .locator(`text=${order.orderNumber}`)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  const cancelBody = await page.locator("body").innerText().catch(() => "");
  // Turkish capital İ (U+0130) does not lowercase to 'i' under JS /i flag,
  // so accept both forms explicitly (label is "İptal Edildi").
  if (!/[iİ]ptal|cancel/i.test(cancelBody)) {
    rec({
      title: "Customer does not see CANCELLED status after admin cancel",
      category: "logic",
      severity: "P0",
      role: "customer",
      url: "/hesabim/siparislerim",
      steps: [
        `Admin/DB sets order status = CANCELLED`,
        "Customer GET /hesabim/siparislerim",
      ],
      expected: "Order labelled 'İptal' / 'CANCELLED'",
      actual: cancelBody.slice(0, 300),
    });
  }

  // REVERT
  setOrderStatus(order.id, originalStatus);
});

function translateStatus(s: string): string {
  switch (s) {
    case "PROCESSING": return "işlen|hazırlan|hazirlan|onaylan";
    case "APPROVED": return "onaylan|onayl";
    case "CANCELLED": return "iptal";
    case "PENDING": return "bekliyor|beklemede|beklen";
    case "SHIPPED": return "kargo";
    case "DELIVERED": return "teslim";
    default: return s;
  }
}
