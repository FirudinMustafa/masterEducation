/**
 * A-FormFuzz — Adversarial payloads against every reachable public form +
 * authenticated profile/address/change-password forms.
 *
 * Strategy
 * --------
 * - For free-text fields we exercise a payload matrix (XSS, SQLi, length,
 *   unicode, null-byte, HTML, empty, malformed email, phone, numeric extremes)
 *   directly against the backing JSON API. This is far faster than driving
 *   each form via the browser for every payload, and the surface we care
 *   about (server validation + reflected response) is identical.
 * - For each form we additionally render the page in the browser ONCE so the
 *   spec records evidence that the form is reachable (or redirects).
 * - We then check three things per (form × payload):
 *     a) Does the response body contain the literal payload back unescaped?
 *        → reflected XSS (P0 if the payload is a <script>/<img>/javascript:
 *        URL and lands inside HTML; downgraded if it lands inside JSON only).
 *     b) HTTP status === 500 with a leaked Prisma/stack trace? → P1
 *     c) Validation skipped — i.e. obviously invalid payload accepted with
 *        200 OK (e.g. malformed email accepted on contact form).
 *
 * Time budget: each individual fetch is bounded by `FETCH_TIMEOUT_MS`. The
 * whole test is bounded by Playwright's per-test timeout in playwright.config.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { detectMasterEducationServer, recordFinding, uniqueEmail } from "./_helpers";

const QA_RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-2228";
const RUN_ROOT = path.resolve(process.cwd(), `qa-run/${QA_RUN_DIR}`);
const FORM_FINDINGS_FILE = path.join(RUN_ROOT, "findings", "findings-forms.jsonl");
const EVIDENCE_DIR = path.join(RUN_ROOT, "evidence", "forms");
const FETCH_TIMEOUT_MS = 20_000;

let nextId = 0;
function nextFindingId(): string {
  nextId += 1;
  return `FF-${String(nextId).padStart(4, "0")}`;
}

function recordFormFinding(f: {
  title: string;
  category: "security" | "ui" | "logic" | "test-env-gap";
  severity: "P0" | "P1" | "P2" | "P3";
  role: "anonymous" | "customer";
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string;
  payload?: unknown;
  status?: number;
}) {
  if (!fs.existsSync(path.dirname(FORM_FINDINGS_FILE))) {
    fs.mkdirSync(path.dirname(FORM_FINDINGS_FILE), { recursive: true });
  }
  const row = {
    id: nextFindingId(),
    title: f.title,
    category: f.category,
    severity: f.severity,
    role: f.role,
    url: f.url,
    steps: f.steps,
    expected: f.expected,
    actual: f.actual,
    evidence: f.evidence ?? `evidence/forms/${path.basename(__filename)}.log`,
    workflow: "form-fuzz",
    status: "open",
    source: "A-FormFuzz",
    payload: f.payload,
    response_status: f.status,
  };
  fs.appendFileSync(FORM_FINDINGS_FILE, JSON.stringify(row) + "\n");
}

// ----------------------------------------------------------------------------
// Payload matrix
// ----------------------------------------------------------------------------
type PayloadKind =
  | "xss-script"
  | "xss-img-onerror"
  | "xss-js-uri"
  | "sqli-or"
  | "sqli-drop"
  | "maxlen"
  | "unicode"
  | "nullbyte"
  | "html-injection"
  | "empty"
  | "whitespace"
  | "email-bad1"
  | "email-bad2"
  | "email-bad3"
  | "email-bad4";

const TEXT_PAYLOADS: Record<PayloadKind, string> = {
  "xss-script": "<script>alert(1)</script>",
  "xss-img-onerror": '<img src=x onerror=alert(1)>',
  "xss-js-uri": "javascript:alert(1)",
  "sqli-or": "' OR '1'='1",
  "sqli-drop": "'; DROP TABLE users;--",
  maxlen: "A".repeat(5000),
  unicode: "日本語🎉العربية",
  nullbyte: "value\0injected",
  "html-injection": "<h1>Pwned</h1>",
  empty: "",
  whitespace: "    \t   ",
  "email-bad1": "not-an-email",
  "email-bad2": "a@",
  "email-bad3": "@b.com",
  "email-bad4": "a..b@c.com",
};

// Subset used for free-text content fields
const CONTENT_PAYLOADS: PayloadKind[] = [
  "xss-script",
  "xss-img-onerror",
  "xss-js-uri",
  "sqli-or",
  "sqli-drop",
  "maxlen",
  "unicode",
  "nullbyte",
  "html-injection",
  "empty",
  "whitespace",
];

// Subset for email fields (malformed addresses)
const EMAIL_PAYLOADS: PayloadKind[] = [
  "email-bad1",
  "email-bad2",
  "email-bad3",
  "email-bad4",
  "xss-script",
  "sqli-or",
  "empty",
  "whitespace",
];

// Subset for phone fields
const PHONE_PAYLOADS: string[] = ["abc", "+xxx", "1".repeat(5000), "<script>alert(1)</script>"];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
type FetchOutcome = {
  status: number;
  body: string;
  contentType: string;
  durationMs: number;
  timedOut: boolean;
};

async function postJson(
  request: APIRequestContext,
  url: string,
  body: unknown,
  cookieHeader?: string,
): Promise<FetchOutcome> {
  const t0 = Date.now();
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cookieHeader) headers.Cookie = cookieHeader;
    // Many endpoints rate-limit aggressively; if we get 429 back off briefly
    let res = await request.post(url, {
      headers,
      data: JSON.stringify(body),
      timeout: FETCH_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    if (res.status() === 429) {
      await new Promise((r) => setTimeout(r, 600));
      res = await request.post(url, {
        headers,
        data: JSON.stringify(body),
        timeout: FETCH_TIMEOUT_MS,
        failOnStatusCode: false,
      });
    }
    const text = await res.text().catch(() => "");
    return {
      status: res.status(),
      body: text,
      contentType: res.headers()["content-type"] ?? "",
      durationMs: Date.now() - t0,
      timedOut: false,
    };
  } catch (err) {
    return {
      status: 0,
      body: `__error__ ${(err as Error).message}`,
      contentType: "",
      durationMs: Date.now() - t0,
      timedOut: (err as Error).message.toLowerCase().includes("timeout"),
    };
  }
}

function bodyExposesServerInternals(body: string): string | null {
  // Look for stack-trace-y / framework-leak signatures
  const patterns = [
    /PrismaClient[A-Za-z]*Error/,
    /\bat\s+[A-Za-z_]+\s+\(.*\.(ts|js):\d+:\d+\)/,
    /node_modules\/[^"'\s]+\.(ts|js)/,
    /\bzod\b.*?\bissues\b/i,
    /TypeError:.*\bundefined\b/,
    /SyntaxError:/,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m) return m[0].slice(0, 200);
  }
  return null;
}

function reflectsLiteral(body: string, payload: string, contentType: string): boolean {
  if (!payload || payload.length < 4) return false;
  // For JSON responses, raw inclusion still indicates the payload was stored
  // verbatim; for HTML responses, raw inclusion of "<script>" or "<img …>" is
  // the real XSS smoking gun. We only flag HTML responses as P0 below.
  const haystack = body;
  if (!haystack.includes(payload)) return false;
  // Inside JSON, a script tag may be present as a string value — that's fine.
  if (contentType.includes("application/json")) {
    // We still flag the unicode/maxlen cases as logic findings later, but
    // they're not XSS. Return false here to avoid noise.
    return false;
  }
  return true;
}

function describeKind(kind: PayloadKind): string {
  switch (kind) {
    case "xss-script":
    case "xss-img-onerror":
    case "xss-js-uri":
      return "XSS";
    case "sqli-or":
    case "sqli-drop":
      return "SQLi";
    case "maxlen":
      return "5000-char string";
    case "unicode":
      return "Unicode mixed scripts";
    case "nullbyte":
      return "Null byte injection";
    case "html-injection":
      return "HTML injection";
    case "empty":
      return "Empty string";
    case "whitespace":
      return "Whitespace only";
    case "email-bad1":
    case "email-bad2":
    case "email-bad3":
    case "email-bad4":
      return "Malformed email";
  }
}

// ----------------------------------------------------------------------------
// Per-form fuzz worker
// ----------------------------------------------------------------------------
type FormSpec = {
  id: string;
  pagePath: string;
  apiPath: string;
  role: "anonymous" | "customer";
  // builder receives a specific field+payload override and produces full request body
  build: (override: Record<string, unknown>) => Record<string, unknown>;
  // fields to fuzz with text payloads
  textFields: string[];
  // fields to fuzz with email payloads
  emailFields: string[];
  // fields to fuzz with phone payloads
  phoneFields: string[];
  // expected validation behavior: returns true if status is "accepted" (200/2xx)
  // OK from the form's perspective. We use this to detect "validation skipped".
  // For some forms (forgot-password) 200 is always returned regardless of input.
  acceptedIsLegitimate?: (payload: unknown, status: number) => boolean;
};

async function fuzzForm(
  request: APIRequestContext,
  spec: FormSpec,
  cookieHeader?: string,
) {
  const findingsCount = { p0: 0, p1: 0, p2: 0, p3: 0 };
  const statusTally: Record<string, number> = {};
  function tally(s: number) {
    const k = String(s);
    statusTally[k] = (statusTally[k] ?? 0) + 1;
  }

  // 1) Text payload matrix on each text field
  for (const field of spec.textFields) {
    for (const kind of CONTENT_PAYLOADS) {
      const val = TEXT_PAYLOADS[kind];
      const body = spec.build({ [field]: val });
      const res = await postJson(request, spec.apiPath, body, cookieHeader);
      tally(res.status);
      if (res.timedOut) {
        recordFormFinding({
          title: `${spec.id}: ${spec.apiPath} timed out (>${FETCH_TIMEOUT_MS}ms) for field=${field} kind=${kind}`,
          category: "test-env-gap",
          severity: "P2",
          role: spec.role,
          url: spec.apiPath,
          steps: [`POST ${spec.apiPath}`, `field=${field}`, `payload=${describeKind(kind)}`],
          expected: "Response within 20s",
          actual: `timeout after ${res.durationMs}ms`,
          payload: val,
          status: res.status,
        });
        findingsCount.p2++;
        continue;
      }

      // Server 500 with stack trace?
      if (res.status === 500) {
        const leak = bodyExposesServerInternals(res.body);
        recordFormFinding({
          title: leak
            ? `${spec.id}: ${spec.apiPath} returns 500 with leaked server internals (${describeKind(kind)} payload)`
            : `${spec.id}: ${spec.apiPath} returns 500 on ${describeKind(kind)} payload to ${field}`,
          category: leak ? "security" : "logic",
          severity: leak ? "P1" : "P2",
          role: spec.role,
          url: spec.apiPath,
          steps: [
            `POST ${spec.apiPath}`,
            `field=${field}`,
            `payload kind=${kind}`,
            `body excerpt: ${res.body.slice(0, 200)}`,
          ],
          expected: "Validation error (400) with a Turkish user-facing message, no stack trace",
          actual: `status=500, leak=${leak ?? "no stack trace detected"}`,
          payload: val,
          status: res.status,
        });
        if (leak) findingsCount.p1++;
        else findingsCount.p2++;
        continue;
      }

      // Reflected XSS in HTML response?
      if (reflectsLiteral(res.body, val, res.contentType)) {
        const isExecXss = kind === "xss-script" || kind === "xss-img-onerror";
        recordFormFinding({
          title: `${spec.id}: ${describeKind(kind)} payload reflected unescaped in ${res.contentType} response (field=${field})`,
          category: "security",
          severity: isExecXss ? "P0" : "P1",
          role: spec.role,
          url: spec.apiPath,
          steps: [
            `POST ${spec.apiPath}`,
            `field=${field}`,
            `payload=${val}`,
            "Inspect response body for literal payload",
          ],
          expected: "Response should escape user content (or not echo it back at all)",
          actual: `Literal payload appears in response with content-type=${res.contentType}`,
          payload: val,
          status: res.status,
        });
        if (isExecXss) findingsCount.p0++;
        else findingsCount.p1++;
        continue;
      }

      // Validation skipped: malformed-on-its-face payload accepted with 2xx
      const accepted = res.status >= 200 && res.status < 300;
      if (
        accepted &&
        (kind === "empty" || kind === "whitespace" || kind === "maxlen") &&
        !(spec.acceptedIsLegitimate && spec.acceptedIsLegitimate(val, res.status))
      ) {
        recordFormFinding({
          title: `${spec.id}: ${describeKind(kind)} payload accepted (HTTP ${res.status}) for required field=${field}`,
          category: "logic",
          severity: "P1",
          role: spec.role,
          url: spec.apiPath,
          steps: [`POST ${spec.apiPath}`, `field=${field}`, `payload=${describeKind(kind)}`],
          expected: "Required-field validation should reject empty/whitespace; max length should reject 5000 chars",
          actual: `Accepted with status=${res.status}, body=${res.body.slice(0, 160)}`,
          payload: val,
          status: res.status,
        });
        findingsCount.p1++;
        continue;
      }

      // English error when Turkish expected?
      if (!accepted && /[A-Za-z]/.test(res.body) && res.contentType.includes("json")) {
        const looksEnglish =
          /\binvalid\b|\brequired\b|\bmust be\b|\bplease provide\b/i.test(res.body) &&
          !/[ğüşöçıİĞÜŞÖÇ]/.test(res.body);
        if (looksEnglish) {
          recordFormFinding({
            title: `${spec.id}: English error message returned by ${spec.apiPath} (field=${field}, kind=${kind})`,
            category: "ui",
            severity: "P2",
            role: spec.role,
            url: spec.apiPath,
            steps: [`POST ${spec.apiPath}`, `field=${field}`, `payload kind=${kind}`],
            expected: "All user-visible error messages should be Turkish",
            actual: `Body looks English: ${res.body.slice(0, 200)}`,
            payload: val,
            status: res.status,
          });
          findingsCount.p2++;
        }
      }
    }
  }

  // 2) Email payload matrix on each email field
  for (const field of spec.emailFields) {
    for (const kind of EMAIL_PAYLOADS) {
      const val = TEXT_PAYLOADS[kind];
      const body = spec.build({ [field]: val });
      const res = await postJson(request, spec.apiPath, body, cookieHeader);
      tally(res.status);
      if (res.timedOut) continue;
      if (res.status === 500) {
        const leak = bodyExposesServerInternals(res.body);
        recordFormFinding({
          title: `${spec.id}: ${spec.apiPath} 500 on malformed email (${kind})`,
          category: leak ? "security" : "logic",
          severity: leak ? "P1" : "P2",
          role: spec.role,
          url: spec.apiPath,
          steps: [`POST ${spec.apiPath}`, `field=${field}`, `payload=${val}`],
          expected: "400 with field-level Turkish error message",
          actual: `status=500, leak=${leak ?? "no"}`,
          payload: val,
          status: res.status,
        });
        if (leak) findingsCount.p1++;
        else findingsCount.p2++;
        continue;
      }
      // Validation skipped — bad email accepted
      const accepted = res.status >= 200 && res.status < 300;
      if (
        accepted &&
        kind.startsWith("email-bad") &&
        !(spec.acceptedIsLegitimate && spec.acceptedIsLegitimate(val, res.status))
      ) {
        recordFormFinding({
          title: `${spec.id}: malformed email "${val}" accepted by ${spec.apiPath} (field=${field})`,
          category: "logic",
          severity: "P1",
          role: spec.role,
          url: spec.apiPath,
          steps: [`POST ${spec.apiPath}`, `email field=${field}`, `value=${val}`],
          expected: "Schema should reject malformed email (z.email)",
          actual: `Accepted with status=${res.status}`,
          payload: val,
          status: res.status,
        });
        findingsCount.p1++;
      }
    }
  }

  // 3) Phone payload matrix
  for (const field of spec.phoneFields) {
    for (const val of PHONE_PAYLOADS) {
      const body = spec.build({ [field]: val });
      const res = await postJson(request, spec.apiPath, body, cookieHeader);
      tally(res.status);
      if (res.timedOut) continue;
      if (res.status === 500) {
        const leak = bodyExposesServerInternals(res.body);
        recordFormFinding({
          title: `${spec.id}: ${spec.apiPath} 500 on bad phone value`,
          category: leak ? "security" : "logic",
          severity: leak ? "P1" : "P2",
          role: spec.role,
          url: spec.apiPath,
          steps: [`POST ${spec.apiPath}`, `field=${field}`, `value=${val.slice(0, 40)}`],
          expected: "400 with Turkish error",
          actual: `status=500, leak=${leak ?? "no"}`,
          payload: val,
          status: res.status,
        });
        if (leak) findingsCount.p1++;
        else findingsCount.p2++;
      }
    }
  }

  // Always emit a per-form summary row (P3 observational) so the report
  // shows whether the fuzz actually exercised the endpoint vs got blocked.
  const total = Object.values(statusTally).reduce((a, b) => a + b, 0);
  const tally429 = statusTally["429"] ?? 0;
  const tally500 = statusTally["500"] ?? 0;
  const tally2xx = Object.entries(statusTally)
    .filter(([k]) => k.startsWith("2"))
    .reduce((a, [, v]) => a + v, 0);
  const tally4xx = Object.entries(statusTally)
    .filter(([k]) => k.startsWith("4") && k !== "429")
    .reduce((a, [, v]) => a + v, 0);

  recordFormFinding({
    title: `${spec.id} summary: ${total} requests against ${spec.apiPath} — 2xx=${tally2xx} 4xx=${tally4xx} 429=${tally429} 500=${tally500}`,
    category: tally429 / Math.max(total, 1) > 0.5 ? "test-env-gap" : "logic",
    severity: tally429 / Math.max(total, 1) > 0.5 ? "P2" : "P3",
    role: spec.role,
    url: spec.apiPath,
    steps: [`Fuzz matrix exercised across ${spec.textFields.length} text + ${spec.emailFields.length} email + ${spec.phoneFields.length} phone fields`],
    expected: "Rate limiter should not exceed 50% of fuzz attempts; validation should reject invalid payloads with 4xx",
    actual: `status_tally=${JSON.stringify(statusTally)}`,
    payload: undefined,
  });

  return findingsCount;
}

// ----------------------------------------------------------------------------
// Form specifications
// ----------------------------------------------------------------------------
function fresh(prefix: string) {
  return uniqueEmail(prefix);
}

const FORM_REGISTER: FormSpec = {
  id: "register",
  pagePath: "/kayit",
  apiPath: "/api/auth/register",
  role: "anonymous",
  build: (o) => ({
    name: "Test User",
    email: fresh("ff-reg"),
    phone: "05551234567",
    password: "StrongPw1!aB",
    termsAccepted: true,
    marketingConsent: false,
    website: "",
    ...o,
  }),
  textFields: ["name"],
  emailFields: ["email"],
  phoneFields: ["phone"],
};

const FORM_LOGIN: FormSpec = {
  // NextAuth /api/auth/callback/credentials always returns 200 with an
  // error param in the redirect; not reasonable to fuzz directly. We hit
  // it anyway with a smaller matrix.
  id: "login",
  pagePath: "/giris",
  apiPath: "/api/auth/callback/credentials?json=true",
  role: "anonymous",
  build: (o) => ({
    email: "qa-fixture-customer@qa.local",
    password: "wrong",
    csrfToken: "",
    redirect: "false",
    ...o,
  }),
  textFields: [],
  emailFields: ["email"],
  phoneFields: [],
  acceptedIsLegitimate: () => true, // we don't expect bypass here; only XSS/500 matter
};

const FORM_FORGOT: FormSpec = {
  id: "forgot-password",
  pagePath: "/sifremi-unuttum",
  apiPath: "/api/auth/forgot-password",
  role: "anonymous",
  build: (o) => ({ email: fresh("ff-fp"), ...o }),
  textFields: [],
  emailFields: ["email"],
  phoneFields: [],
  // forgot-password intentionally returns 200 to avoid email enumeration
  acceptedIsLegitimate: () => true,
};

const FORM_DEALER: FormSpec = {
  id: "dealer-apply",
  pagePath: "/bayi-basvuru",
  apiPath: "/api/dealer/apply",
  role: "anonymous",
  build: (o) => ({
    name: "Bayi Test",
    email: fresh("ff-dealer"),
    phone: "05551234567",
    password: "StrongPw1!aB",
    companyName: "Test Sti",
    taxOffice: "Kadikoy",
    taxNumber: "1234567890",
    tradeRegNo: "12345",
    contactPerson: "Test",
    city: "Istanbul",
    district: "Kadikoy",
    addressLine: "Test cd. 1",
    termsAccepted: true,
    marketingConsent: false,
    ...o,
  }),
  textFields: ["companyName", "taxNumber", "addressLine"],
  emailFields: ["email"],
  phoneFields: ["phone"],
};

const FORM_CONTACT: FormSpec = {
  id: "contact",
  pagePath: "/iletisim",
  apiPath: "/api/contact",
  role: "anonymous",
  build: (o) => ({
    name: "Form Fuzz",
    email: fresh("ff-contact"),
    phone: "05551234567",
    subject: "Test konu",
    message: "Yeterince uzun bir mesaj icerigi.",
    ...o,
  }),
  textFields: ["name", "subject", "message"],
  emailFields: ["email"],
  phoneFields: ["phone"],
};

const FORM_KVKK: FormSpec = {
  id: "kvkk-basvuru",
  pagePath: "/kvkk-basvuru",
  apiPath: "/api/kvkk-basvuru",
  role: "anonymous",
  build: (o) => ({
    fullName: "Kvkk Test",
    tckn: "12345678901",
    email: fresh("ff-kvkk"),
    phone: "05551234567",
    address: "Test adres",
    relationship: "kendi",
    requestType: "INFO_REQUEST",
    detail: "Lutfen verilerimi gosterin, KVKK kapsaminda talep ediyorum.",
    channel: "email",
    ...o,
  }),
  textFields: ["fullName", "detail", "address"],
  emailFields: ["email"],
  phoneFields: ["phone"],
};

// Authenticated forms — share a session cookie obtained via NextAuth
const FORM_PROFILE: FormSpec = {
  id: "account-profile",
  pagePath: "/hesabim/profil",
  // PATCH endpoint is /api/account/profile
  apiPath: "/api/account/profile",
  role: "customer",
  build: (o) => ({
    name: "Existing Name",
    phone: "05551234567",
    ...o,
  }),
  textFields: ["name"],
  emailFields: [],
  phoneFields: ["phone"],
};

const FORM_ADDRESS: FormSpec = {
  id: "account-address",
  pagePath: "/hesabim/adresler",
  apiPath: "/api/account/addresses",
  role: "customer",
  build: (o) => ({
    fullName: "Adres Test",
    phone: "05551234567",
    city: "Istanbul",
    district: "Kadikoy",
    addressLine: "Test cd. 1",
    title: "Ev",
    isDefault: false,
    ...o,
  }),
  textFields: ["fullName", "addressLine", "city", "district"],
  emailFields: [],
  phoneFields: ["phone"],
};

const FORM_CHGPW: FormSpec = {
  id: "account-change-password",
  pagePath: "/hesabim/sifre-degistir",
  apiPath: "/api/auth/change-password",
  role: "customer",
  build: (o) => ({
    currentPassword: "QaFixture2026!",
    newPassword: "QaFixture2026!new",
    ...o,
  }),
  textFields: ["newPassword"],
  emailFields: [],
  phoneFields: [],
};

// ----------------------------------------------------------------------------
// Spec
// ----------------------------------------------------------------------------
test.describe.configure({ mode: "serial" });

test("A-FormFuzz: payload matrix against every reachable form", async ({ request, browser }, testInfo) => {
  test.setTimeout(15 * 60 * 1000);

  const env = await detectMasterEducationServer(request);
  if (!env.ok) {
    recordFormFinding({
      title: "Dev server not master-education — A-FormFuzz cannot run",
      category: "test-env-gap",
      severity: "P0",
      role: "anonymous",
      url: "/api/health",
      steps: ["GET /api/health", `reason: ${env.reason}`],
      expected: "Master Education app on :3000",
      actual: env.reason ?? "unknown",
    });
    test.skip(true, `Form fuzz blocked: ${env.reason}`);
    return;
  }

  if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  // Take page screenshots once per form (evidence of reachability)
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const spec of [FORM_REGISTER, FORM_LOGIN, FORM_FORGOT, FORM_DEALER, FORM_CONTACT, FORM_KVKK]) {
    try {
      const r = await page.goto(spec.pagePath, { timeout: 15_000, waitUntil: "domcontentloaded" });
      const finalUrl = page.url();
      if (r && r.status() >= 400) {
        recordFormFinding({
          title: `${spec.id}: ${spec.pagePath} returned HTTP ${r.status()}`,
          category: "test-env-gap",
          severity: "P2",
          role: spec.role,
          url: spec.pagePath,
          steps: [`GET ${spec.pagePath}`],
          expected: "Form page renders 200",
          actual: `status=${r.status()}, final url=${finalUrl}`,
        });
      }
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `${spec.id}__page.png`),
        fullPage: false,
      }).catch(() => {});
    } catch {
      /* skip silently */
    }
  }
  await ctx.close();

  // Fuzz anonymous forms
  const tally = { p0: 0, p1: 0, p2: 0, p3: 0 };
  for (const spec of [FORM_REGISTER, FORM_LOGIN, FORM_FORGOT, FORM_DEALER, FORM_CONTACT, FORM_KVKK]) {
    const t = await fuzzForm(request, spec);
    tally.p0 += t.p0;
    tally.p1 += t.p1;
    tally.p2 += t.p2;
    tally.p3 += t.p3;
  }

  // ---- Authenticated: login as qa-fixture-customer ------------------------
  const authCtx = await browser.newContext();
  const authPage = await authCtx.newPage();
  let cookieHeader: string | undefined;
  try {
    await authPage.goto("/giris", { timeout: 15_000 });
    await authPage.fill('input#email', "qa-fixture-customer@qa.local");
    await authPage.fill('input#password', "QaFixture2026!");
    await Promise.all([
      authPage.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {}),
      authPage.click('button[type="submit"]'),
    ]);
    // Verify auth
    const sessionRes = await authPage.request.get("/api/auth/session", { timeout: 10_000 });
    const session = await sessionRes.json().catch(() => ({}));
    if (session?.user?.email === "qa-fixture-customer@qa.local") {
      const cookies = await authCtx.cookies("http://localhost:3000");
      cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } else {
      recordFormFinding({
        title: "A-FormFuzz: qa-fixture-customer login failed; authenticated forms skipped",
        category: "test-env-gap",
        severity: "P2",
        role: "customer",
        url: "/giris",
        steps: ["Fill /giris with fixture creds", "Check /api/auth/session"],
        expected: "Session for qa-fixture-customer@qa.local",
        actual: `session=${JSON.stringify(session).slice(0, 160)}`,
      });
    }
  } catch (err) {
    recordFormFinding({
      title: "A-FormFuzz: fixture login threw — authenticated forms skipped",
      category: "test-env-gap",
      severity: "P2",
      role: "customer",
      url: "/giris",
      steps: ["Fill /giris with fixture creds"],
      expected: "Successful navigation",
      actual: `error: ${(err as Error).message}`,
    });
  }

  if (cookieHeader) {
    for (const spec of [FORM_PROFILE, FORM_ADDRESS, FORM_CHGPW]) {
      const t = await fuzzForm(request, spec, cookieHeader);
      tally.p0 += t.p0;
      tally.p1 += t.p1;
      tally.p2 += t.p2;
      tally.p3 += t.p3;
    }
  }
  await authCtx.close().catch(() => {});

  // Sanity: spec must have written *something* to findings file
  expect(fs.existsSync(FORM_FINDINGS_FILE)).toBeTruthy();
  testInfo.annotations.push({
    type: "fuzz-tally",
    description: `P0=${tally.p0} P1=${tally.p1} P2=${tally.p2} P3=${tally.p3}`,
  });
});
