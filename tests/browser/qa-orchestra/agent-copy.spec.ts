/**
 * A-Copy QA agent.
 *
 * Audits Turkish UI text across Master Education for:
 *  - English fallback (Submit/Cancel/Loading/Error/etc.)
 *  - Diacritic strip (Iletisim instead of İletişim)
 *  - Inconsistency (Sepet vs Cart, Adres vs Address)
 *  - Common typos / placeholder leakage (lorem/TODO/FIXME)
 *  - Curly vs straight quote mix
 *  - ALL CAPS body shouting
 *  - Empty rendered elements (buttons with no label)
 *  - Number/date formatting (TR uses 1.234,56 and 18.05.2026)
 *
 * For each URL in the scan list, the page is loaded, document.body.innerText
 * captured, saved to evidence/copy/{slug}.txt, then checks run. Findings get
 * appended to findings/findings-copy.jsonl.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { detectMasterEducationServer, QA_RUN_ROOT } from "./_helpers";

const EVIDENCE_COPY_DIR = path.join(QA_RUN_ROOT, "evidence", "copy");
const FINDINGS_COPY_FILE = path.join(
  QA_RUN_ROOT,
  "findings",
  "findings-copy.jsonl",
);

interface CopyFinding {
  id: string;
  title: string;
  category: "ui";
  severity: "P0" | "P1" | "P2" | "P3";
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string;
  workflow: "copy";
}

let findingCounter = 1;

function nextId(): string {
  const n = String(findingCounter++).padStart(4, "0");
  return `C-${n}`;
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function appendFinding(f: CopyFinding) {
  ensureDir(path.dirname(FINDINGS_COPY_FILE));
  fs.appendFileSync(FINDINGS_COPY_FILE, JSON.stringify(f) + "\n");
}

// Reset jsonl at file load so reruns aren't stacked
ensureDir(EVIDENCE_COPY_DIR);
ensureDir(path.dirname(FINDINGS_COPY_FILE));
fs.writeFileSync(FINDINGS_COPY_FILE, "");

const URLS: { slug: string; url: string; needsAuth?: "customer" | "admin" }[] = [
  { slug: "home", url: "/" },
  { slug: "urunler", url: "/urunler" },
  { slug: "kategoriler", url: "/kategoriler" },
  { slug: "yayinevleri", url: "/yayinevleri" },
  { slug: "sepet", url: "/sepet" },
  { slug: "odeme", url: "/odeme" },
  { slug: "odeme-basarili", url: "/odeme/basarili" },
  { slug: "odeme-basarisiz", url: "/odeme/basarisiz" },
  { slug: "giris", url: "/giris" },
  { slug: "kayit", url: "/kayit" },
  { slug: "bayi-basvuru", url: "/bayi-basvuru" },
  { slug: "hesabim", url: "/hesabim", needsAuth: "customer" },
  { slug: "admin", url: "/admin", needsAuth: "admin" },
  { slug: "yonetim", url: "/yonetim", needsAuth: "admin" },
  { slug: "iletisim", url: "/iletisim" },
  { slug: "sss", url: "/sss" },
  { slug: "hakkimizda", url: "/hakkimizda" },
  { slug: "kvkk", url: "/kvkk" },
  { slug: "uyelik-sozlesmesi", url: "/uyelik-sozlesmesi" },
  { slug: "iade", url: "/iade" },
];

const ADMIN = { email: "admin@mastereducation.com.tr", password: "Master2026!Admin" };
const CUSTOMER = {
  email: "qa-fixture-customer@qa.local",
  password: "QaFixture2026!",
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/giris");
  await page
    .locator('input[type="email"], #email, input[name="email"]')
    .first()
    .fill(email);
  await page
    .locator('input[type="password"], #password, input[name="password"]')
    .first()
    .fill(password);
  await page
    .getByRole("button", { name: /(giris yap|giriş yap|signin|login|oturum)/i })
    .first()
    .click()
    .catch(async () => {
      await page.locator('button[type="submit"]').first().click().catch(() => {});
    });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// ----- check functions -----

const ENGLISH_FALLBACK_WORDS = [
  "Submit",
  "Loading\\.\\.\\.",
  "Sign in",
  "Sign up",
  "Logout",
  "Login",
  "Register",
];

function checkEnglishFallback(url: string, text: string): CopyFinding[] {
  const found: CopyFinding[] = [];
  for (const w of ENGLISH_FALLBACK_WORDS) {
    const re = new RegExp(`\\b${w}\\b`);
    if (re.test(text)) {
      found.push({
        id: nextId(),
        title: `English fallback word "${w.replace(/\\\./g, ".")}" appears on ${url}`,
        category: "ui",
        severity: "P1",
        role: "anonymous",
        url,
        steps: ["scan body innerText", `match /\\b${w}\\b/`],
        expected: "Turkish-localized label",
        actual: `English word "${w.replace(/\\\./g, ".")}" present in body text`,
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      });
    }
  }
  // Cancel: only flag if Cancel appears WITHOUT Iptal/Vazgec context
  if (/\bCancel\b/.test(text) && !/\b(İptal|Iptal|Vazgeç|Vazgec)\b/.test(text)) {
    found.push({
      id: nextId(),
      title: `English "Cancel" without Turkish equivalent on ${url}`,
      category: "ui",
      severity: "P1",
      role: "anonymous",
      url,
      steps: ["scan body innerText", "match /\\bCancel\\b/"],
      expected: "İptal / Vazgeç",
      actual: "Cancel (no Turkish counterpart in same view)",
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    });
  }
  // Error / Success - generic words; flag only if isolated (no Hata/Basarili nearby)
  if (/\bError\b/.test(text) && !/\b(Hata|Hatalı)\b/.test(text)) {
    found.push({
      id: nextId(),
      title: `English "Error" without Turkish "Hata" on ${url}`,
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url,
      steps: ["scan body innerText"],
      expected: "Hata",
      actual: "Error present, Hata absent",
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    });
  }
  if (/\bSuccess\b/.test(text) && !/\b(Başarılı|Basarili)\b/.test(text)) {
    found.push({
      id: nextId(),
      title: `English "Success" without Turkish "Başarılı" on ${url}`,
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url,
      steps: ["scan body innerText"],
      expected: "Başarılı",
      actual: "Success present, Başarılı absent",
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    });
  }
  // Yes/No: only flag if no Evet/Hayir present
  if (
    /\bYes\b/.test(text) &&
    /\bNo\b/.test(text) &&
    !/\b(Evet|Hayır|Hayir)\b/.test(text)
  ) {
    found.push({
      id: nextId(),
      title: `English Yes/No without Evet/Hayır on ${url}`,
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url,
      steps: ["scan body innerText"],
      expected: "Evet / Hayır",
      actual: "Yes / No present, Evet/Hayır absent",
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    });
  }
  return found;
}

const DIACRITIC_PAIRS: { ascii: RegExp; diacritic: RegExp; label: string }[] = [
  { ascii: /\bIletisim\b/, diacritic: /\bİletişim\b/, label: "İletişim" },
  { ascii: /\bSifre\b/, diacritic: /\bŞifre\b/, label: "Şifre" },
  { ascii: /\bIade\b/, diacritic: /\bİade\b/, label: "İade" },
  { ascii: /\bCerez\b/, diacritic: /\bÇerez\b/, label: "Çerez" },
  { ascii: /\bSiparis\b/, diacritic: /\bSipariş\b/, label: "Sipariş" },
  { ascii: /\bGiris\b/, diacritic: /\bGiriş\b/, label: "Giriş" },
  { ascii: /\bKategori\b/, diacritic: /\bKategori\b/, label: "Kategori" }, // same
];

function checkDiacriticStrip(url: string, text: string): CopyFinding[] {
  const found: CopyFinding[] = [];
  for (const pair of DIACRITIC_PAIRS) {
    if (pair.label === "Kategori") continue;
    if (pair.ascii.test(text) && !pair.diacritic.test(text)) {
      found.push({
        id: nextId(),
        title: `Diacritic stripped: ASCII form found but not "${pair.label}" on ${url}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url,
        steps: ["scan body innerText", `regex ${pair.ascii}`],
        expected: pair.label,
        actual: `ASCII variant present (no Turkish diacritic counterpart on page)`,
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      });
    }
  }
  return found;
}

function checkPlaceholder(url: string, text: string): CopyFinding[] {
  const out: CopyFinding[] = [];
  const PLACEHOLDERS = [
    /\blorem\b/i,
    /\bipsum\b/i,
    /\bTODO\b/,
    /\bFIXME\b/,
    /\bXXX\b/,
    /dummy data/i,
    /placeholder text/i,
  ];
  for (const re of PLACEHOLDERS) {
    if (re.test(text)) {
      out.push({
        id: nextId(),
        title: `Placeholder text "${re}" leaked to UI on ${url}`,
        category: "ui",
        severity: "P1",
        role: "anonymous",
        url,
        steps: ["scan body innerText", `regex ${re}`],
        expected: "production copy",
        actual: `placeholder/marker token matched`,
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      });
    }
  }
  return out;
}

function checkTypos(url: string, text: string): CopyFinding[] {
  const out: CopyFinding[] = [];
  // Common Turkish-domain typo patterns: English nouns leaking in copy
  const TYPO_PATTERNS: { re: RegExp; expected: string; label: string }[] = [
    { re: /\brecip\b/i, expected: "tarif", label: "recip→tarif" },
    { re: /\bdiscount\b/i, expected: "indirim", label: "discount→indirim" },
    { re: /\bquantity\b/i, expected: "adet", label: "quantity→adet" },
    { re: /\baddress\b/i, expected: "adres", label: "address→adres" },
    { re: /\bcart\b/i, expected: "sepet", label: "cart→sepet" },
    { re: /\border\b/i, expected: "sipariş", label: "order→sipariş" },
  ];
  for (const p of TYPO_PATTERNS) {
    if (p.re.test(text)) {
      out.push({
        id: nextId(),
        title: `English term leak (${p.label}) on ${url}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url,
        steps: ["scan body innerText"],
        expected: p.expected,
        actual: `matched ${p.re}`,
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      });
    }
  }
  return out;
}

function checkCurlyQuoteMix(url: string, text: string): CopyFinding[] {
  const hasCurly = /[‘’“”]/.test(text);
  const hasStraight = /['"]/.test(text);
  if (hasCurly && hasStraight) {
    return [
      {
        id: nextId(),
        title: `Mixed curly + straight quotes on ${url}`,
        category: "ui",
        severity: "P3",
        role: "anonymous",
        url,
        steps: ["scan body innerText"],
        expected: "Consistent quote style across page",
        actual: "Both curly (‘ / ’ / “ / ”) and straight quotes present",
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      },
    ];
  }
  return [];
}

function checkAllCaps(url: string, text: string): CopyFinding[] {
  // Look for body lines longer than 25 chars that are entirely uppercase letters / spaces / punctuation
  const offenders: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (line.length < 25 || line.length > 200) continue;
    // Allow if contains any lowercase Turkish or Latin letter
    if (/[a-zçğıöşü]/.test(line)) continue;
    // Must contain at least two uppercase Turkish/Latin letters
    if ((line.match(/[A-ZÇĞİÖŞÜ]/g) ?? []).length < 8) continue;
    offenders.push(line.slice(0, 120));
    if (offenders.length >= 3) break;
  }
  if (offenders.length === 0) return [];
  return [
    {
      id: nextId(),
      title: `ALL CAPS body line(s) detected on ${url}`,
      category: "ui",
      severity: "P3",
      role: "anonymous",
      url,
      steps: ["scan body innerText", "split lines, filter uppercase-only"],
      expected: "Sentence-case body copy",
      actual: `e.g. "${offenders[0]}"`,
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    },
  ];
}

function checkNumberFormat(url: string, text: string): CopyFinding[] {
  // Turkish: 1.234,56 / English: 1,234.56
  // Flag obvious English-format prices: \d{1,3}(,\d{3})+\.\d{2}
  const enPriceRe = /\b\d{1,3}(,\d{3})+\.\d{2}\b/;
  const m = text.match(enPriceRe);
  if (m) {
    return [
      {
        id: nextId(),
        title: `English number formatting (${m[0]}) on ${url}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url,
        steps: ["scan body innerText", `regex ${enPriceRe}`],
        expected: "Turkish locale 1.234,56",
        actual: `Found ${m[0]}`,
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      },
    ];
  }
  return [];
}

function checkDateFormat(url: string, text: string): CopyFinding[] {
  // English MM/DD/YYYY where TR expects DD.MM.YYYY or DD Ay YYYY
  const enDateRe = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/\d{4}\b/;
  const m = text.match(enDateRe);
  if (m) {
    return [
      {
        id: nextId(),
        title: `English-style date (${m[0]}) on ${url}`,
        category: "ui",
        severity: "P2",
        role: "anonymous",
        url,
        steps: ["scan body innerText"],
        expected: "DD.MM.YYYY or DD Ay YYYY",
        actual: m[0],
        evidence: `evidence/copy/${slugForUrl(url)}.txt`,
        workflow: "copy",
      },
    ];
  }
  return [];
}

async function checkBlankButtons(
  page: Page,
  url: string,
): Promise<CopyFinding[]> {
  // Count <button> elements whose visible text + aria-label + title are all empty
  const blanks = await page
    .evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a[role='button']"));
      let count = 0;
      const samples: string[] = [];
      for (const el of btns) {
        const txt = (el.textContent ?? "").trim();
        const aria = (el.getAttribute("aria-label") ?? "").trim();
        const title = (el.getAttribute("title") ?? "").trim();
        const hasIcon = !!el.querySelector("svg, img");
        if (!txt && !aria && !title) {
          // Skip if it has an icon and is a likely icon-only button (those usually have aria-label, but tolerate)
          count++;
          if (samples.length < 3) {
            samples.push((el.outerHTML ?? "").slice(0, 120));
          }
          if (hasIcon) {
            /* still flag */
          }
        }
      }
      return { count, samples };
    })
    .catch(() => ({ count: 0, samples: [] as string[] }));
  if (blanks.count === 0) return [];
  return [
    {
      id: nextId(),
      title: `${blanks.count} button(s) with no accessible label on ${url}`,
      category: "ui",
      severity: "P2",
      role: "anonymous",
      url,
      steps: ["query button + a[role=button]", "check text/aria-label/title all empty"],
      expected: "Every button has visible text or aria-label",
      actual: `${blanks.count} blank button(s). Sample: ${blanks.samples[0] ?? ""}`,
      evidence: `evidence/copy/${slugForUrl(url)}.txt`,
      workflow: "copy",
    },
  ];
}

const slugMap = new Map<string, string>();
function slugForUrl(url: string): string {
  return slugMap.get(url) ?? url.replace(/[^a-z0-9-]+/gi, "_");
}

// ----- inconsistency tracker (cross-page) -----

const concepts: Record<string, string[]> = {
  cart: ["Sepet", "Cart"],
  address: ["Adres", "Address"],
  order: ["Sipariş", "Siparis", "Order"],
};

interface FreqRow {
  concept: string;
  variant: string;
  url: string;
  count: number;
}

const freqRows: FreqRow[] = [];

function tallyConcepts(url: string, text: string) {
  for (const [concept, variants] of Object.entries(concepts)) {
    for (const v of variants) {
      const re = new RegExp(`\\b${v}\\b`, "g");
      const matches = text.match(re);
      if (matches && matches.length > 0) {
        freqRows.push({ concept, variant: v, url, count: matches.length });
      }
    }
  }
}

// ----- main test -----

test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000); // 15 min budget for 20 URL scan + auth

test("A-Copy: scan all 16 URLs and emit copy findings", async ({
  page,
  request,
}, testInfo) => {
  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    appendFinding({
      id: nextId(),
      title: "Dev server is not Master Education (A-Copy cannot run)",
      category: "ui",
      severity: "P0",
      role: "system",
      url: "/api/health",
      steps: ["GET /api/health"],
      expected: "Master Education health shape",
      actual: env.reason ?? "unknown",
      workflow: "copy",
    });
    test.skip(true, `A-Copy blocked: ${env.reason}`);
    return;
  }

  // Build slug map
  for (const u of URLS) slugMap.set(u.url, u.slug);

  let loginRole: "none" | "customer" | "admin" = "none";

  for (const target of URLS) {
    // Authenticate as needed
    if (target.needsAuth === "admin" && loginRole !== "admin") {
      // try admin login; if fails, skip auth and just visit (likely redirect)
      await login(page, ADMIN.email, ADMIN.password);
      loginRole = "admin";
    } else if (target.needsAuth === "customer" && loginRole === "none") {
      await login(page, CUSTOMER.email, CUSTOMER.password);
      loginRole = "customer";
    }

    const resp = await page.goto(target.url, { waitUntil: "domcontentloaded" }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});

    const innerText = await page
      .evaluate(() => document.body?.innerText ?? "")
      .catch(() => "");

    const evidencePath = path.join(EVIDENCE_COPY_DIR, `${target.slug}.txt`);
    fs.writeFileSync(
      evidencePath,
      `# URL: ${target.url}\n# Status: ${resp?.status() ?? "n/a"}\n# Captured: ${new Date().toISOString()}\n\n${innerText}\n`,
    );

    // If page status is 4xx/5xx, record but still run checks on the body (likely error page)
    if (resp && resp.status() >= 400) {
      appendFinding({
        id: nextId(),
        title: `Page returned ${resp.status()} for ${target.url}`,
        category: "ui",
        severity: resp.status() >= 500 ? "P1" : "P2",
        role: target.needsAuth ?? "anonymous",
        url: target.url,
        steps: [`navigate ${target.url}`],
        expected: "200 OK or graceful Turkish error page",
        actual: `HTTP ${resp.status()}`,
        evidence: `evidence/copy/${target.slug}.txt`,
        workflow: "copy",
      });
    }

    // Missing copy: completely empty body
    if (innerText.trim().length < 20) {
      appendFinding({
        id: nextId(),
        title: `Page body essentially empty on ${target.url}`,
        category: "ui",
        severity: "P1",
        role: target.needsAuth ?? "anonymous",
        url: target.url,
        steps: ["capture document.body.innerText"],
        expected: "Page content rendered",
        actual: `innerText length = ${innerText.trim().length}`,
        evidence: `evidence/copy/${target.slug}.txt`,
        workflow: "copy",
      });
      // skip further checks on empty page
      continue;
    }

    // Run all text checks
    const all: CopyFinding[] = [
      ...checkEnglishFallback(target.url, innerText),
      ...checkDiacriticStrip(target.url, innerText),
      ...checkPlaceholder(target.url, innerText),
      ...checkTypos(target.url, innerText),
      ...checkCurlyQuoteMix(target.url, innerText),
      ...checkAllCaps(target.url, innerText),
      ...checkNumberFormat(target.url, innerText),
      ...checkDateFormat(target.url, innerText),
      ...(await checkBlankButtons(page, target.url)),
    ];
    for (const f of all) appendFinding(f);

    tallyConcepts(target.url, innerText);
  }

  // Cross-page inconsistency: a concept that has >1 distinct variant ever used
  for (const [concept, variants] of Object.entries(concepts)) {
    const used = variants.filter((v) =>
      freqRows.some((r) => r.concept === concept && r.variant === v && r.count > 0),
    );
    if (used.length > 1) {
      const distribution = freqRows
        .filter((r) => r.concept === concept)
        .map((r) => `${r.variant}×${r.count}@${r.url}`)
        .join(", ");
      appendFinding({
        id: nextId(),
        title: `Inconsistent term for "${concept}": ${used.join(" / ")}`,
        category: "ui",
        severity: "P3",
        role: "anonymous",
        url: "(multiple)",
        steps: ["aggregate frequency table across all scanned pages"],
        expected: `Single Turkish term for ${concept}`,
        actual: `Variants used: ${distribution}`,
        evidence: "evidence/copy/",
        workflow: "copy",
      });
    }
  }

  // Always pass — this spec only emits findings, never fails the run
  expect(true).toBe(true);
});
