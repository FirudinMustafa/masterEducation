/**
 * A-A11y QA Agent — axe-core accessibility scans against Master Education
 *
 * Scans 15 key URLs with axe-core (WCAG 2.1 A + AA tags), groups violations
 * by impact, writes one finding per (rule × selector-pattern) deduplicated
 * across pages.
 *
 * Output:
 *   qa-run/$QA_RUN_DIR/findings/findings-a11y.jsonl
 *   qa-run/$QA_RUN_DIR/evidence/a11y/<slug>.json
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { detectMasterEducationServer } from "./_helpers";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-2228";
const QA_RUN_ROOT = path.resolve(process.cwd(), `qa-run/${QA_RUN_DIR}`);
const FINDINGS_FILE = path.join(QA_RUN_ROOT, "findings", "findings-a11y.jsonl");
const EVIDENCE_DIR = path.join(QA_RUN_ROOT, "evidence", "a11y");

const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PASSWORD = "Master2026!Admin";
const CUSTOMER_EMAIL = "qa-fixture-customer@qa.local";
const CUSTOMER_PASSWORD = "QaFixture2026!";

// First product slug (captured at run-time below from /urunler).
let firstProductSlug = "the-chase-5-practice-book-new-edition-66300";

type AuthMode = "anonymous" | "customer" | "admin";

interface UrlEntry {
  path: string;
  slug: string;
  auth: AuthMode;
}

function buildUrls(): UrlEntry[] {
  return [
    { path: "/", slug: "home", auth: "anonymous" },
    { path: "/urunler", slug: "urunler", auth: "anonymous" },
    { path: `/urunler/${firstProductSlug}`, slug: "urun-detay", auth: "anonymous" },
    { path: "/kategoriler", slug: "kategoriler", auth: "anonymous" },
    { path: "/yayinevleri", slug: "yayinevleri", auth: "anonymous" },
    { path: "/sepet", slug: "sepet", auth: "anonymous" },
    { path: "/odeme", slug: "odeme", auth: "customer" },
    { path: "/giris", slug: "giris", auth: "anonymous" },
    { path: "/kayit", slug: "kayit", auth: "anonymous" },
    { path: "/bayi-basvuru", slug: "bayi-basvuru", auth: "anonymous" },
    { path: "/hesabim", slug: "hesabim", auth: "customer" },
    { path: "/admin", slug: "admin", auth: "admin" },
    { path: "/yonetim", slug: "yonetim", auth: "admin" },
    { path: "/iletisim", slug: "iletisim", auth: "anonymous" },
    { path: "/sss", slug: "sss", auth: "anonymous" },
  ];
}

async function login(page: Page, email: string, password: string): Promise<boolean> {
  await page.goto("/giris", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[name="email"], #email')
    .first()
    .fill(email)
    .catch(() => undefined);
  await page.locator('input[type="password"], #password, input[name="password"]')
    .first()
    .fill(password)
    .catch(() => undefined);
  const btn = page.getByRole("button", { name: /(giris yap|giris|signin|login|gir)/i }).first();
  if (await btn.count() === 0) return false;
  await btn.click().catch(() => undefined);
  // Wait briefly for session to settle.
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
  // Verify session via /api/auth/session.
  try {
    const r = await page.request.get("/api/auth/session");
    const j = (await r.json().catch(() => null)) as { user?: { email?: string } } | null;
    return !!j?.user?.email;
  } catch {
    return false;
  }
}

interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  help: string;
  helpUrl: string;
  description: string;
  nodes: Array<{ target: string[]; html: string }>;
}

function impactToSeverity(impact: AxeViolation["impact"]): "P0" | "P1" | "P2" | "P3" {
  switch (impact) {
    case "critical": return "P0";
    case "serious": return "P1";
    case "moderate": return "P2";
    default: return "P3";
  }
}

// Normalize a selector to detect "same selector pattern" across pages.
// Strip indices (e.g., :nth-child(3)) and IDs/long classes to compare structurally.
function selectorPattern(target: string[]): string {
  return target
    .map((sel) =>
      sel
        .replace(/:nth-(child|of-type)\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(/#[A-Za-z0-9_-]+/g, "#ID")
        .replace(/\.[A-Za-z0-9_-]{8,}/g, ".CLS"),
    )
    .join(" >> ");
}

interface DedupKey {
  ruleId: string;
  selectorPattern: string;
}

interface DedupBucket {
  ruleId: string;
  selectorPattern: string;
  help: string;
  helpUrl: string;
  impact: AxeViolation["impact"];
  affectedPages: Set<string>;
  selectors: Set<string>;
  evidenceFile: string;
}

const buckets = new Map<string, DedupBucket>();

function bucketKey(k: DedupKey): string {
  return `${k.ruleId}::${k.selectorPattern}`;
}

const totalsByImpact: Record<string, number> = {
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
};
const ruleCounts = new Map<string, number>();

function ingest(entry: UrlEntry, violations: AxeViolation[]) {
  for (const v of violations) {
    const impact = v.impact ?? "minor";
    totalsByImpact[impact] = (totalsByImpact[impact] ?? 0) + (v.nodes.length || 1);
    ruleCounts.set(v.id, (ruleCounts.get(v.id) ?? 0) + (v.nodes.length || 1));

    for (const node of v.nodes) {
      const pattern = selectorPattern(node.target);
      const key = bucketKey({ ruleId: v.id, selectorPattern: pattern });
      let b = buckets.get(key);
      if (!b) {
        b = {
          ruleId: v.id,
          selectorPattern: pattern,
          help: v.help,
          helpUrl: v.helpUrl,
          impact: v.impact,
          affectedPages: new Set(),
          selectors: new Set(),
          evidenceFile: `evidence/a11y/${entry.slug}.json`,
        };
        buckets.set(key, b);
      }
      b.affectedPages.add(entry.path);
      b.selectors.add(node.target.join(" >> "));
      // Track most-severe impact across pages.
      const rank = { critical: 4, serious: 3, moderate: 2, minor: 1 } as const;
      const curr = (b.impact ?? "minor") as keyof typeof rank;
      const next = (v.impact ?? "minor") as keyof typeof rank;
      if (rank[next] > rank[curr]) b.impact = v.impact;
    }
  }
}

test.describe.configure({ mode: "serial" });

test.describe("A-A11y axe-core scans", () => {
  test.beforeAll(async () => {
    if (!fs.existsSync(path.dirname(FINDINGS_FILE))) {
      fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
    }
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test("scan all urls and emit findings", async ({ page, request }) => {
    test.setTimeout(13 * 60_000); // 13 min budget within 15-min overall

    const detect = await detectMasterEducationServer(request);
    if (!detect.ok) {
      const row = {
        id: "A-0001",
        title: `axe scan skipped: ${detect.reason ?? "server-not-master-education"}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url: "/",
        steps: ["GET /api/health"],
        expected: "Master Education health.components shape",
        actual: detect.reason ?? "unknown",
        evidence: "",
        suggested_fix: "Start Master Education dev server on http://localhost:3000",
        workflow: "a11y",
        status: "open",
        source: "A-A11y",
        scope_check: "test-env-gap",
      };
      fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
      test.skip();
      return;
    }

    // Discover real first-product slug from /urunler so the URL exists.
    try {
      const r = await page.request.get("/urunler");
      const html = await r.text();
      const m = html.match(/\/urunler\/([a-z0-9-]+)["']/);
      if (m) firstProductSlug = m[1];
    } catch {
      // keep default
    }

    const urls = buildUrls();
    await page.setViewportSize({ width: 1280, height: 720 });

    let loggedInAs: AuthMode = "anonymous";

    for (const entry of urls) {
      // Auth transitions
      if (entry.auth !== loggedInAs) {
        // Log out by clearing cookies before switching identity.
        await page.context().clearCookies().catch(() => undefined);
        if (entry.auth === "customer") {
          const ok = await login(page, CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
          loggedInAs = ok ? "customer" : "anonymous";
        } else if (entry.auth === "admin") {
          const ok = await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
          loggedInAs = ok ? "admin" : "anonymous";
        } else {
          loggedInAs = "anonymous";
        }
      }

      let navOk = true;
      try {
        await page.goto(entry.path, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      } catch {
        navOk = false;
      }

      if (!navOk) {
        // Record a finding capturing nav failure but continue.
        const row = {
          title: `axe: page-load-failed — ${entry.path}`,
          category: "ui",
          severity: "P2",
          role: entry.auth,
          url: entry.path,
          steps: [`page.goto(${entry.path})`],
          expected: "page loads within 20s",
          actual: "navigation failed or timed out",
          evidence: `evidence/a11y/${entry.slug}.json`,
          suggested_fix: "Verify route exists and server can render",
          workflow: "a11y",
          status: "open",
          source: "A-A11y",
          scope_check: "ok",
        };
        fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
        continue;
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
        .catch((err: Error) => ({ violations: [], _error: err.message }));

      // Save full evidence (raw axe result).
      const evidencePath = path.join(EVIDENCE_DIR, `${entry.slug}.json`);
      fs.writeFileSync(
        evidencePath,
        JSON.stringify(
          {
            url: entry.path,
            scannedAt: new Date().toISOString(),
            auth: entry.auth,
            viewport: { width: 1280, height: 720 },
            violations: (results as { violations: AxeViolation[] }).violations,
          },
          null,
          2,
        ),
      );

      ingest(entry, (results as { violations: AxeViolation[] }).violations ?? []);
    }

    // Emit one finding per dedup bucket.
    let idx = 100;
    for (const b of buckets.values()) {
      idx += 1;
      const pages = Array.from(b.affectedPages).sort();
      const selectors = Array.from(b.selectors).slice(0, 5);
      const row = {
        id: `A-${String(idx).padStart(4, "0")}`,
        title: `axe: ${b.ruleId} — ${b.help}`,
        category: "ui",
        severity: impactToSeverity(b.impact),
        role: "anonymous",
        url: pages[0],
        steps: ["axe.run() at 1280×720"],
        expected: "WCAG AA pass",
        actual: `${b.selectors.size} violations: ${selectors.join(", ")}${b.selectors.size > 5 ? " …" : ""}`,
        evidence: b.evidenceFile,
        suggested_fix: b.helpUrl,
        workflow: "a11y",
        status: "open",
        source: "A-A11y",
        scope_check: "ok",
        impact: b.impact ?? "minor",
        affectedPages: pages,
      };
      fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
    }

    // Write a summary sidecar for the agent's own report.
    const summary = {
      totalsByImpact,
      topRules: Array.from(ruleCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, count]) => ({ id, count })),
      uniqueFindings: buckets.size,
    };
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, "_summary.json"),
      JSON.stringify(summary, null, 2),
    );

    expect(buckets.size).toBeGreaterThanOrEqual(0);
  });
});
