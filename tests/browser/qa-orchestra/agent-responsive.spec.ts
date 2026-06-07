/**
 * A-Responsive QA agent.
 *
 * Visits a fixed set of pages across 8 viewports, captures full-page screenshots
 * and records responsive/layout findings (horizontal overflow, sticky-header
 * collision, unreachable CTAs, broken images, undersized tap targets, etc.).
 *
 * Findings are written to:
 *   qa-run/<QA_RUN_DIR>/findings/findings-responsive.jsonl
 * Screenshots to:
 *   qa-run/<QA_RUN_DIR>/evidence/responsive/{viewport}__{slug}.png
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-2228";
const QA_ROOT = path.resolve(process.cwd(), `qa-run/${QA_RUN_DIR}`);
const FINDINGS_FILE = path.join(QA_ROOT, "findings", "findings-responsive.jsonl");
const EVIDENCE_DIR = path.join(QA_ROOT, "evidence", "responsive");

fs.mkdirSync(path.dirname(FINDINGS_FILE), { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// Track screenshots written so the final report can count them.
let screenshotCount = 0;
let findingCounter = 1;
const severityTally: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };

type Severity = "P0" | "P1" | "P2" | "P3";

interface Finding {
  id: string;
  title: string;
  category: "ui";
  severity: Severity;
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string;
  workflow: "responsive";
}

function nextId(): string {
  const n = String(findingCounter++).padStart(4, "0");
  return `R-${n}`;
}

function recordFinding(f: Omit<Finding, "id" | "category" | "workflow">) {
  const row: Finding = {
    id: nextId(),
    category: "ui",
    workflow: "responsive",
    ...f,
  };
  severityTally[row.severity] = (severityTally[row.severity] ?? 0) + 1;
  fs.appendFileSync(FINDINGS_FILE, JSON.stringify(row) + "\n");
}

const VIEWPORTS = [
  { name: "320x568", w: 320, h: 568, mobile: true },
  { name: "375x667", w: 375, h: 667, mobile: true },
  { name: "414x896", w: 414, h: 896, mobile: true },
  { name: "768x1024", w: 768, h: 1024, mobile: false },
  { name: "1024x768", w: 1024, h: 768, mobile: false },
  { name: "1280x720", w: 1280, h: 720, mobile: false },
  { name: "1440x900", w: 1440, h: 900, mobile: false },
  { name: "1920x1080", w: 1920, h: 1080, mobile: false },
] as const;

interface PageDef {
  slug: string; // for screenshot filename + finding id
  path: string;
  auth?: "admin" | "customer";
  title: string;
}

// First product slug pulled at runtime, but for stability we baked in a known-good slug
// from /api/search?q=cambridge at the time the spec was authored. The test will try to
// resolve a fresh slug on the fly and fall back to this if the search call fails.
const FALLBACK_PRODUCT_SLUG = "cambridge-igcse-revision-guide-biology-63835";

async function resolveFirstProductSlug(ctx: BrowserContext): Promise<string> {
  try {
    const res = await ctx.request.get("/api/search?q=a", { timeout: 8_000 });
    if (res.ok()) {
      const body = (await res.json()) as { products?: Array<{ slug?: string }> };
      const slug = body.products?.[0]?.slug;
      if (slug) return slug;
    }
  } catch {
    /* swallow */
  }
  try {
    const res = await ctx.request.get("/api/search?q=cambridge", { timeout: 8_000 });
    if (res.ok()) {
      const body = (await res.json()) as { products?: Array<{ slug?: string }> };
      const slug = body.products?.[0]?.slug;
      if (slug) return slug;
    }
  } catch {
    /* swallow */
  }
  return FALLBACK_PRODUCT_SLUG;
}

const ADMIN_EMAIL = "admin@mastereducation.com.tr";
const ADMIN_PASS = "Master2026!Admin";
const CUSTOMER_EMAIL = "qa-fixture-customer@qa.local";
const CUSTOMER_PASS = "QaFixture2026!";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/giris", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.fill('input#email', email);
  await page.fill('input#password', password);
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  // wait a beat for the redirect
  await page.waitForTimeout(1500);
}

interface OverflowItem {
  tag: string;
  cls: string;
  width: number;
  text: string;
}

interface PageAudit {
  loadMs: number;
  loadFailed: boolean;
  jsErrors: string[];
  is404: boolean;
  docOverflow: { scrollWidth: number; clientWidth: number };
  overflowingElements: OverflowItem[];
  brokenImages: Array<{ src: string; alt: string }>;
  tapTargetsTooSmall: Array<{ tag: string; text: string; w: number; h: number }>;
  stickyHeaderHeight: number;
  stickyHeaderZ: number | null;
  highestBodyZ: number | null;
  ctaBelowFold: Array<{ tag: string; text: string; top: number; bottom: number }>;
  bodyEmpty: boolean;
}

async function auditPage(page: Page, viewportH: number, isMobile: boolean): Promise<PageAudit> {
  return await page.evaluate(
    ({ vh, isMobile }) => {
      const doc = document.documentElement;
      const body = document.body;

      // doc overflow
      const docOverflow = {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };

      // any element whose right edge spills past viewport width
      const vw = doc.clientWidth;
      const overflowingElements: OverflowItem[] = [];
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const el of all) {
        if (overflowingElements.length >= 8) break;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 2 && r.width > 50) {
          // exclude position:fixed/sticky elements that may overlap by design
          const cs = window.getComputedStyle(el);
          if (cs.position === "fixed" || cs.position === "sticky") continue;
          overflowingElements.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 80),
            width: Math.round(r.width),
            text: (el.textContent || "").trim().slice(0, 60),
          });
        }
      }

      // broken images (naturalWidth === 0, excluding placeholders/svgs/data uris)
      const brokenImages: Array<{ src: string; alt: string }> = [];
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
      for (const img of imgs) {
        const src = img.currentSrc || img.src || "";
        if (!src) continue;
        if (src.startsWith("data:")) continue;
        if (img.complete && img.naturalWidth === 0) {
          // skip product placeholder logos
          if (/placeholder|no-?image|fallback/i.test(src)) continue;
          brokenImages.push({ src: src.slice(0, 150), alt: img.alt || "" });
          if (brokenImages.length >= 6) break;
        }
      }

      // tap targets too small (mobile only)
      const tapTargetsTooSmall: Array<{ tag: string; text: string; w: number; h: number }> = [];
      if (isMobile) {
        const targets = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button, a[href], [role="button"], input[type="button"], input[type="submit"]',
          ),
        );
        for (const t of targets) {
          if (tapTargetsTooSmall.length >= 6) break;
          const r = t.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // skip hidden / off-screen
          const cs = window.getComputedStyle(t);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          // skip purely icon decorations inside larger button hit-zones
          if ((r.width < 44 || r.height < 44) && r.width >= 10 && r.height >= 10) {
            // ensure no ancestor button >= 44
            let p = t.parentElement;
            let coveredByParent = false;
            while (p && p !== body) {
              if (p.matches('button, a[href], [role="button"]')) {
                const pr = p.getBoundingClientRect();
                if (pr.width >= 44 && pr.height >= 44) {
                  coveredByParent = true;
                  break;
                }
              }
              p = p.parentElement;
            }
            if (coveredByParent) continue;
            tapTargetsTooSmall.push({
              tag: t.tagName.toLowerCase(),
              text: (t.textContent || t.getAttribute("aria-label") || "").trim().slice(0, 40),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
      }

      // sticky/fixed header height + z-index
      let stickyHeaderHeight = 0;
      let stickyHeaderZ: number | null = null;
      const header = document.querySelector<HTMLElement>("header");
      if (header) {
        const cs = window.getComputedStyle(header);
        if (cs.position === "fixed" || cs.position === "sticky") {
          const r = header.getBoundingClientRect();
          stickyHeaderHeight = Math.round(r.height);
          const z = parseInt(cs.zIndex, 10);
          stickyHeaderZ = Number.isFinite(z) ? z : null;
        }
      }

      // highest body z-index (non-fixed/sticky content) — used to detect collision
      let highestBodyZ: number | null = null;
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        if (cs.position === "static") continue;
        const z = parseInt(cs.zIndex, 10);
        if (Number.isFinite(z) && (highestBodyZ === null || z > highestBodyZ)) {
          highestBodyZ = z;
        }
      }

      // primary CTAs whose top is below the viewport with no scroll cue
      const ctaBelowFold: Array<{ tag: string; text: string; top: number; bottom: number }> = [];
      const primarySelectors = [
        'button[type="submit"]',
        'button:has-text("Odeme")',
        'a[href="/odeme"]',
        'a[href="/sepet"]',
        'button[aria-label*="Sepete"]',
      ];
      for (const sel of primarySelectors) {
        try {
          const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.top > vh + 50) {
              ctaBelowFold.push({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
              });
              if (ctaBelowFold.length >= 4) break;
            }
          }
        } catch {
          /* invalid selector for some browsers */
        }
        if (ctaBelowFold.length >= 4) break;
      }

      // page totally empty?
      const bodyEmpty =
        (body.innerText || "").trim().length < 20 && imgs.length === 0;

      const is404 = /404/.test(document.title) || /could not be found/i.test(body.innerText || "");

      return {
        loadMs: 0,
        loadFailed: false,
        jsErrors: [],
        is404,
        docOverflow,
        overflowingElements,
        brokenImages,
        tapTargetsTooSmall,
        stickyHeaderHeight,
        stickyHeaderZ,
        highestBodyZ,
        ctaBelowFold,
        bodyEmpty,
      };
    },
    { vh: viewportH, isMobile },
  );
}

test.describe.configure({ mode: "serial" });

test("A-Responsive: capture screenshots and detect responsive bugs", async ({ browser }) => {
  test.setTimeout(25 * 60 * 1000); // 25 minutes budget

  // Resolve product slug once via a throwaway context.
  const seedCtx = await browser.newContext();
  const productSlug = await resolveFirstProductSlug(seedCtx);
  await seedCtx.close();
  console.log(`[A-Responsive] Using product slug: ${productSlug}`);

  const PAGES: PageDef[] = [
    { slug: "home", path: "/", title: "Anasayfa" },
    { slug: "urunler", path: "/urunler", title: "Urunler" },
    { slug: "urun-detay", path: `/urunler/${productSlug}`, title: "Urun detay" },
    { slug: "kategoriler", path: "/kategoriler", title: "Kategoriler" },
    { slug: "yayinevleri", path: "/yayinevleri", title: "Yayinevleri" },
    { slug: "sepet", path: "/sepet", title: "Sepet" },
    { slug: "odeme", path: "/odeme", title: "Odeme" },
    { slug: "giris", path: "/giris", title: "Giris" },
    { slug: "kayit", path: "/kayit", title: "Kayit" },
    { slug: "bayi-basvuru", path: "/bayi-basvuru", title: "Bayi basvuru" },
    { slug: "hesabim", path: "/hesabim", auth: "customer", title: "Hesabim" },
    { slug: "hesabim-profil", path: "/hesabim/profil", auth: "customer", title: "Hesabim profil" },
    { slug: "hesabim-adresler", path: "/hesabim/adresler", auth: "customer", title: "Hesabim adresler" },
    { slug: "admin", path: "/admin", auth: "admin", title: "Admin" },
    { slug: "yonetim", path: "/yonetim", auth: "admin", title: "Yonetim" },
  ];

  // Create one context per role to reuse logged-in cookies.
  const anonCtx = await browser.newContext();
  const customerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();

  // Sign in customer + admin once. If login fails, downstream page audits still run
  // but will probably end up on /giris — we log a test-env-gap finding via the missing
  // role redirect detection.
  let customerLoggedIn = false;
  let adminLoggedIn = false;
  try {
    const p = await customerCtx.newPage();
    await loginAs(p, CUSTOMER_EMAIL, CUSTOMER_PASS);
    const sessionRes = await customerCtx.request.get("/api/auth/session");
    const sess = (await sessionRes.json().catch(() => ({}))) as { user?: unknown };
    customerLoggedIn = !!sess?.user;
    await p.close();
  } catch (err) {
    console.warn(`[A-Responsive] customer login failed: ${(err as Error).message}`);
  }
  try {
    const p = await adminCtx.newPage();
    await loginAs(p, ADMIN_EMAIL, ADMIN_PASS);
    const sessionRes = await adminCtx.request.get("/api/auth/session");
    const sess = (await sessionRes.json().catch(() => ({}))) as { user?: unknown };
    adminLoggedIn = !!sess?.user;
    await p.close();
  } catch (err) {
    console.warn(`[A-Responsive] admin login failed: ${(err as Error).message}`);
  }

  if (!customerLoggedIn) {
    recordFinding({
      title: "Customer test fixture login failed",
      severity: "P3",
      role: "anonymous",
      url: "/giris",
      steps: ["POST /api/auth/callback/credentials with qa-fixture-customer@qa.local"],
      expected: "session.user is present",
      actual: "session.user is null — /hesabim/* audits will redirect to /giris",
    });
  }
  if (!adminLoggedIn) {
    recordFinding({
      title: "Admin test fixture login failed",
      severity: "P3",
      role: "anonymous",
      url: "/giris",
      steps: ["POST /api/auth/callback/credentials with admin@mastereducation.com.tr"],
      expected: "session.user.role === ADMIN",
      actual: "Admin not authenticated — /admin and /yonetim audits will redirect",
    });
  }

  function ctxFor(p: PageDef): BrowserContext {
    if (p.auth === "admin") return adminCtx;
    if (p.auth === "customer") return customerCtx;
    return anonCtx;
  }
  function roleFor(p: PageDef): string {
    if (p.auth === "admin") return "admin";
    if (p.auth === "customer") return "customer";
    return "anonymous";
  }

  for (const pageDef of PAGES) {
    const ctx = ctxFor(pageDef);
    const role = roleFor(pageDef);

    for (const vp of VIEWPORTS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: vp.w, height: vp.h });

      const jsErrors: string[] = [];
      page.on("pageerror", (e) => jsErrors.push(e.message.slice(0, 200)));

      const fileName = `${vp.name}__${pageDef.slug}.png`;
      const screenshotPath = path.join(EVIDENCE_DIR, fileName);
      const evidenceRel = `evidence/responsive/${fileName}`;

      const t0 = Date.now();
      let loadFailed = false;
      let loadTimedOut = false;
      try {
        const resp = await page.goto(pageDef.path, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        // Light wait so layout settles
        await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
        if (resp && resp.status() >= 500) {
          recordFinding({
            title: `${pageDef.title} returned ${resp.status()} at ${vp.name}`,
            severity: "P0",
            role,
            url: pageDef.path,
            steps: [`Navigate to ${pageDef.path} at viewport ${vp.name}`],
            expected: "200 OK",
            actual: `HTTP ${resp.status()}`,
          });
        }
      } catch (err) {
        const msg = (err as Error).message || "";
        if (/Timeout|timed out/i.test(msg)) loadTimedOut = true;
        else loadFailed = true;
      }
      const loadMs = Date.now() - t0;

      // screenshot regardless — even error pages provide useful evidence
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15_000 });
        screenshotCount++;
      } catch (err) {
        console.warn(`[A-Responsive] screenshot failed ${fileName}: ${(err as Error).message}`);
      }

      if (loadTimedOut || loadMs > 15_000) {
        recordFinding({
          title: `${pageDef.title} load > 15s at ${vp.name}`,
          severity: "P2",
          role,
          url: pageDef.path,
          steps: [`Navigate to ${pageDef.path}`, `Viewport ${vp.name}`],
          expected: "Page DOMContentLoaded within 15s",
          actual: `Load took ${loadMs}ms (timeout or slow)`,
          evidence: evidenceRel,
        });
        await page.close();
        continue;
      }

      if (loadFailed) {
        recordFinding({
          title: `${pageDef.title} failed to load at ${vp.name}`,
          severity: "P0",
          role,
          url: pageDef.path,
          steps: [`Navigate to ${pageDef.path}`, `Viewport ${vp.name}`],
          expected: "Page loads successfully",
          actual: "Navigation threw an exception",
          evidence: evidenceRel,
        });
        await page.close();
        continue;
      }

      let audit: PageAudit;
      try {
        audit = await auditPage(page, vp.h, vp.mobile);
      } catch (err) {
        recordFinding({
          title: `${pageDef.title} audit script failed at ${vp.name}`,
          severity: "P3",
          role,
          url: pageDef.path,
          steps: ["Run in-page audit DOM walker"],
          expected: "Audit returns layout snapshot",
          actual: `Audit threw: ${(err as Error).message.slice(0, 120)}`,
          evidence: evidenceRel,
        });
        await page.close();
        continue;
      }

      // ─── findings ───────────────────────────────────────────────────────────
      if (jsErrors.length > 0) {
        recordFinding({
          title: `Uncaught JS error on ${pageDef.title} at ${vp.name}`,
          severity: "P0",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Watch console"],
          expected: "No uncaught exceptions",
          actual: `JS errors: ${jsErrors.slice(0, 3).join(" | ")}`,
          evidence: evidenceRel,
        });
      }

      if (audit.bodyEmpty && !audit.is404) {
        recordFinding({
          title: `${pageDef.title} renders blank at ${vp.name}`,
          severity: "P0",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`],
          expected: "Page renders content",
          actual: "Body is essentially empty (white screen)",
          evidence: evidenceRel,
        });
      }

      if (audit.is404) {
        recordFinding({
          title: `${pageDef.title} returned 404 at ${vp.name}`,
          severity: "P1",
          role,
          url: pageDef.path,
          steps: [`Navigate to ${pageDef.path}`],
          expected: `${pageDef.path} resolves to a real page`,
          actual: "404 not found",
          evidence: evidenceRel,
        });
      }

      // horizontal scroll
      if (audit.docOverflow.scrollWidth > audit.docOverflow.clientWidth + 1) {
        recordFinding({
          title: `Horizontal scroll on ${pageDef.title} at ${vp.name}`,
          severity: vp.mobile ? "P2" : "P3",
          role,
          url: pageDef.path,
          steps: [
            `Open ${pageDef.path} at ${vp.w}x${vp.h}`,
            "Inspect document.scrollWidth vs document.clientWidth",
          ],
          expected: `scrollWidth <= clientWidth (${audit.docOverflow.clientWidth}px)`,
          actual: `scrollWidth=${audit.docOverflow.scrollWidth}px exceeds viewport by ${
            audit.docOverflow.scrollWidth - audit.docOverflow.clientWidth
          }px`,
          evidence: evidenceRel,
        });
      }

      if (audit.overflowingElements.length > 0) {
        const sample = audit.overflowingElements
          .slice(0, 3)
          .map((o) => `<${o.tag} w=${o.width}px "${o.text}">`)
          .join(", ");
        recordFinding({
          title: `${audit.overflowingElements.length} element(s) overflow viewport on ${pageDef.title} at ${vp.name}`,
          severity: vp.mobile ? "P2" : "P3",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Scan elements where right > viewport width"],
          expected: "All non-fixed elements fit within viewport width",
          actual: `Sample overflow: ${sample}`,
          evidence: evidenceRel,
        });
      }

      if (audit.brokenImages.length > 0) {
        const sample = audit.brokenImages
          .slice(0, 3)
          .map((i) => i.src)
          .join(", ");
        recordFinding({
          title: `${audit.brokenImages.length} broken image(s) on ${pageDef.title} at ${vp.name}`,
          severity: "P2",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Inspect img.naturalWidth === 0"],
          expected: "All <img> elements render with naturalWidth > 0",
          actual: `Broken images: ${sample}`,
          evidence: evidenceRel,
        });
      }

      if (vp.mobile && audit.tapTargetsTooSmall.length > 0) {
        const sample = audit.tapTargetsTooSmall
          .slice(0, 3)
          .map((t) => `<${t.tag} ${t.w}x${t.h} "${t.text}">`)
          .join(", ");
        recordFinding({
          title: `${audit.tapTargetsTooSmall.length} tap target(s) below 44x44px on ${pageDef.title} at ${vp.name}`,
          severity: "P3",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Measure interactive element bounding boxes"],
          expected: "Buttons/links >= 44x44px on mobile (WCAG 2.5.5)",
          actual: `Undersized targets: ${sample}`,
          evidence: evidenceRel,
        });
      }

      // sticky header collision: if any positioned element has z-index >= header z
      // AND is rendered within header height, it would visually overlap.
      if (
        audit.stickyHeaderHeight > 0 &&
        audit.stickyHeaderZ !== null &&
        audit.highestBodyZ !== null &&
        audit.highestBodyZ > audit.stickyHeaderZ + 100
      ) {
        // very high z-index in body content is suspicious (modals are usually fine but huge gaps suggest layering issues)
        recordFinding({
          title: `Body z-index (${audit.highestBodyZ}) wildly exceeds header z-index (${audit.stickyHeaderZ}) on ${pageDef.title} at ${vp.name}`,
          severity: "P3",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Inspect header z-index vs body content"],
          expected: "Sticky header should sit above body content (z-index hierarchy controlled)",
          actual: `header z=${audit.stickyHeaderZ}, max body z=${audit.highestBodyZ}`,
          evidence: evidenceRel,
        });
      }

      if (vp.mobile && audit.ctaBelowFold.length > 0) {
        const sample = audit.ctaBelowFold
          .slice(0, 2)
          .map((c) => `<${c.tag} "${c.text}" top=${c.top}>`)
          .join(", ");
        recordFinding({
          title: `${audit.ctaBelowFold.length} primary CTA(s) below initial fold on ${pageDef.title} at ${vp.name}`,
          severity: "P1",
          role,
          url: pageDef.path,
          steps: [`Open ${pageDef.path} at ${vp.name}`, "Locate primary submit/checkout buttons"],
          expected: "Primary CTAs reachable in initial viewport or with explicit scroll affordance",
          actual: `Below-fold CTAs: ${sample}`,
          evidence: evidenceRel,
        });
      }

      await page.close();
    }
  }

  await anonCtx.close();
  await customerCtx.close();
  await adminCtx.close();

  console.log(
    `[A-Responsive] screenshots=${screenshotCount} findings P0=${severityTally.P0} P1=${severityTally.P1} P2=${severityTally.P2} P3=${severityTally.P3}`,
  );

  expect(screenshotCount).toBeGreaterThan(0);
});
