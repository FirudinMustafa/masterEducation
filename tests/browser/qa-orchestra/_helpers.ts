/**
 * Shared helpers for B6 WorkflowRunner specs.
 *
 * Tüm helper'lar idempotent ve isolated: her test kendi unique email'i ile
 * çalışır (Date.now() + random), DB temizlik gerektirmez.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { APIRequestContext, Page, TestInfo } from "@playwright/test";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-1200";
export const QA_RUN_ROOT = path.resolve(
  process.cwd(),
  `qa-run/${QA_RUN_DIR}`,
);
export const FINDINGS_FILE = path.join(
  QA_RUN_ROOT,
  "findings",
  "findings-workflow.jsonl",
);
export const EVIDENCE_DIR = path.join(QA_RUN_ROOT, "evidence", "workflow");

let nextFindingId = 200;

export function uniqueEmail(prefix = "qa") {
  const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}-${n}@qa.local`;
}

export type Severity = "P0" | "P1" | "P2" | "P3";
export type Category =
  | "security"
  | "logic"
  | "ui"
  | "perf"
  | "observability"
  | "test-env-gap"
  | "illogical";

export interface Finding {
  id?: string;
  title: string;
  category: Category;
  severity: Severity;
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string;
  suggested_fix?: string;
  scope_check?: string;
  status?: string;
  source?: string;
  workflow?: string;
}

export function recordFinding(f: Finding) {
  const id = f.id ?? `F-0${nextFindingId++}`;
  const row: Finding = {
    id,
    status: "open",
    source: "B6",
    scope_check: f.scope_check ?? "ok",
    ...f,
  };
  if (!fs.existsSync(path.dirname(FINDINGS_FILE))) {
    fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
  }
  fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
}

/**
 * Çalışan dev server gerçek Master Education projesi mi diye doğrular.
 * Port 3000 başka bir projeye bağlıysa testler erken bir test-env-gap finding'i
 * yazar ve skip eder (yanlış proje üzerinde anlamsız assertion'lar yapmayalım).
 */
export async function detectMasterEducationServer(
  request: APIRequestContext,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await request.get("/api/health", { timeout: 10_000 });
    if (res.ok()) {
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("application/json")) {
        return { ok: false, reason: `health-not-json (content-type=${ct})` };
      }
      const body = (await res.json()) as Record<string, unknown>;
      // Master Education health.components shape sentinel
      const comp = body.components as Record<string, unknown> | undefined;
      if (!comp || !("db" in comp) || !("email" in comp) || !("payment" in comp)) {
        return { ok: false, reason: "health-shape-mismatch" };
      }
      return { ok: true };
    }
    if (res.status() === 503) return { ok: true }; // env not fully wired, but is our app
    if (res.status() === 500) {
      const body = await res.text().catch(() => "");
      if (body.includes("IstBaku") || body.includes("currency-store"))
        return { ok: false, reason: "wrong-project-on-port-3000" };
      return { ok: false, reason: `health-500 (${body.slice(0, 120)})` };
    }
    return { ok: false, reason: `health-status-${res.status()}` };
  } catch (err) {
    return {
      ok: false,
      reason: `health-fetch-failed: ${(err as Error).message.slice(0, 200)}`,
    };
  }
}

/**
 * En son verification-email token'ını (plain) almak için Prisma'yı doğrudan
 * çalıştırır. Playwright bir browser context içinde çalışır; DB'ye doğrudan
 * erişmek için tsx scripts üzerinden bir tek-seferlik query yaparız.
 *
 * Eğer Prisma boot edemezse null döner — test bunu test-env-gap olarak
 * raporlar.
 */
export function readLatestVerificationTokenFromDb(email: string): string | null {
  const escapedEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "");
  if (escapedEmail !== email) return null;
  const script = `
    import { PrismaClient } from "@prisma/client";
    const p = new PrismaClient();
    (async () => {
      const u = await p.user.findUnique({ where: { email: ${JSON.stringify(email)} } });
      if (!u) { console.log("__NO_USER__"); process.exit(0); }
      const t = await p.verificationToken.findFirst({
        where: { identifier: u.email },
        orderBy: { createdAt: "desc" },
      }).catch(() => null);
      console.log(JSON.stringify({ found: !!t, token: t?.token ?? null }));
    })().catch(e => { console.error(e); process.exit(2); });
  `;
  try {
    const out = execSync(
      `npx tsx -e ${JSON.stringify(script)}`,
      { encoding: "utf8", timeout: 30_000, cwd: process.cwd() },
    );
    const last = out.trim().split("\n").pop() ?? "";
    if (last === "__NO_USER__") return null;
    const parsed = JSON.parse(last) as { found: boolean; token: string | null };
    return parsed.token;
  } catch {
    return null;
  }
}

/**
 * Bir order kaydının state snapshot'ını DB'den çeker (orderEvent + emailLog count).
 */
export function readOrderState(orderNumber: string): {
  orderId: string | null;
  status: string | null;
  paymentStatus: string | null;
  eventCount: number;
  emailLogCount: number;
} | null {
  const script = `
    import { PrismaClient } from "@prisma/client";
    const p = new PrismaClient();
    (async () => {
      const o = await p.order.findUnique({
        where: { orderNumber: ${JSON.stringify(orderNumber)} },
        select: { id: true, status: true, paymentStatus: true, _count: { select: { events: true } } },
      });
      if (!o) { console.log("__NO_ORDER__"); process.exit(0); }
      const elc = await p.emailLog.count({ where: { OR: [
        { metadata: { path: ["orderNumber"], equals: ${JSON.stringify(orderNumber)} } },
        { subject: { contains: ${JSON.stringify(orderNumber)} } },
      ] } }).catch(() => 0);
      console.log(JSON.stringify({ orderId: o.id, status: o.status, paymentStatus: o.paymentStatus, eventCount: o._count.events, emailLogCount: elc }));
    })().catch(e => { console.error(e); process.exit(2); });
  `;
  try {
    const out = execSync(`npx tsx -e ${JSON.stringify(script)}`, {
      encoding: "utf8",
      timeout: 30_000,
      cwd: process.cwd(),
    });
    const last = out.trim().split("\n").pop() ?? "";
    if (last === "__NO_ORDER__") return null;
    return JSON.parse(last);
  } catch {
    return null;
  }
}

/**
 * Bir order için scrub kontrolü (KVKK W7).
 */
export function readUserPiiSnapshot(email: string): {
  email: string;
  name: string | null;
  phone: string | null;
  addressCount: number;
  orderCount: number;
} | null {
  const script = `
    import { PrismaClient } from "@prisma/client";
    const p = new PrismaClient();
    (async () => {
      const u = await p.user.findFirst({
        where: { OR: [{ email: ${JSON.stringify(email)} }, { email: { contains: ${JSON.stringify(email.split("@")[0])} } }] },
        include: { _count: { select: { addresses: true, orders: true } } },
      });
      if (!u) { console.log("__NO_USER__"); process.exit(0); }
      console.log(JSON.stringify({
        email: u.email,
        name: u.name,
        phone: u.phone,
        addressCount: u._count.addresses,
        orderCount: u._count.orders,
      }));
    })().catch(e => { console.error(e); process.exit(2); });
  `;
  try {
    const out = execSync(`npx tsx -e ${JSON.stringify(script)}`, {
      encoding: "utf8",
      timeout: 30_000,
      cwd: process.cwd(),
    });
    const last = out.trim().split("\n").pop() ?? "";
    if (last === "__NO_USER__") return null;
    return JSON.parse(last);
  } catch {
    return null;
  }
}

export async function takeEvidenceScreenshot(
  page: Page,
  testInfo: TestInfo,
  label: string,
): Promise<string> {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "_").slice(0, 80);
  const file = path.join(
    EVIDENCE_DIR,
    `${testInfo.title.replace(/[^a-z0-9-]/gi, "_").slice(0, 60)}__${safeLabel}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
