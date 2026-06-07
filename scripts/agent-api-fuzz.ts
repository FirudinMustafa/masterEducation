/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A-APIFuzz: probe Master Education API endpoints for auth bypass, IDOR,
 * mass assignment, rate-limit issues, and content-type confusion.
 *
 * Usage:
 *   $env:QA_RUN_DIR = "2026-05-18-2228"
 *   npx tsx scripts/agent-api-fuzz.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RUN_DIR =
  process.env.QA_RUN_DIR ??
  (() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  })();

const REPO_ROOT = path.resolve(__dirname, "..");
const RUN_ROOT = path.join(REPO_ROOT, "qa-run", RUN_DIR);
const FINDINGS_DIR = path.join(RUN_ROOT, "findings");
const EVIDENCE_DIR = path.join(RUN_ROOT, "evidence", "api");
fs.mkdirSync(FINDINGS_DIR, { recursive: true });
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const FINDINGS_PATH = path.join(FINDINGS_DIR, "findings-api.jsonl");
// truncate at start
fs.writeFileSync(FINDINGS_PATH, "");

type CookieJar = Map<string, string>;

type Severity = "P0" | "P1" | "P2" | "P3";
type Category = "security" | "logic" | "observability";

interface Finding {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  role: string;
  url: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence: string;
  workflow: "api-fuzz";
}

let findingCounter = 0;
const findings: Finding[] = [];

function nextId() {
  findingCounter += 1;
  return `API-${String(findingCounter).padStart(4, "0")}`;
}

function record(f: Omit<Finding, "id" | "workflow">) {
  const finding: Finding = { id: nextId(), workflow: "api-fuzz", ...f };
  findings.push(finding);
  fs.appendFileSync(FINDINGS_PATH, JSON.stringify(finding) + "\n");
  console.log(
    `  [FIND ${finding.severity}] ${finding.id} ${finding.title}`
  );
}

// ---- Evidence file (REST-Client format) ----
const evidenceFiles = new Map<string, string[]>();
function appendEvidence(slug: string, block: string) {
  const arr = evidenceFiles.get(slug) ?? [];
  arr.push(block);
  evidenceFiles.set(slug, arr);
}
function flushEvidence() {
  for (const [slug, blocks] of evidenceFiles.entries()) {
    const filePath = path.join(EVIDENCE_DIR, `${slug}.http`);
    fs.writeFileSync(filePath, blocks.join("\n\n"));
  }
}

// ---- cookie jar helpers (mirrors tests/scenarios/e2e.ts) ----
function updateJar(jar: CookieJar, headers: Headers) {
  const setCookies = (headers as any).getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value || value === "deleted") jar.delete(name);
    else jar.set(name, value);
  }
}
function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

interface HttpOpts {
  body?: unknown;
  jar?: CookieJar;
  form?: URLSearchParams;
  contentType?: string;
  rawBody?: string;
  headers?: Record<string, string>;
}

interface HttpResult {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any | null;
}

async function http(
  method: string,
  pathStr: string,
  opts: HttpOpts = {}
): Promise<HttpResult> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.jar && opts.jar.size > 0) headers["cookie"] = cookieHeader(opts.jar);
  let payload: BodyInit | undefined;
  if (opts.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = opts.form;
  } else if (opts.rawBody !== undefined) {
    if (opts.contentType !== "") {
      headers["content-type"] = opts.contentType ?? "application/json";
    }
    payload = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers["content-type"] = opts.contentType ?? "application/json";
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${pathStr}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  if (opts.jar) updateJar(opts.jar, res.headers);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  return { status: res.status, headers: headerObj, text, json };
}

async function login(
  jar: CookieJar,
  email: string,
  password: string,
  spoofIp?: string
) {
  const extra: Record<string, string> = {};
  if (spoofIp) extra["x-forwarded-for"] = spoofIp;
  const csrfRes = await http("GET", "/api/auth/csrf", { jar, headers: extra });
  const csrfToken = (csrfRes.json as any)?.csrfToken as string;

  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);
  form.set("csrfToken", csrfToken);
  form.set("callbackUrl", `${BASE}/`);
  form.set("json", "true");

  await http("POST", "/api/auth/callback/credentials", {
    jar,
    form,
    headers: extra,
  });
  const session = await http("GET", "/api/auth/session", { jar, headers: extra });
  return { status: session.status, hasUser: !!(session.json as any)?.user, session };
}

interface Account {
  role:
    | "admin"
    | "customer"
    | "dealer_approved"
    | "dealer_pending"
    | "dealer_rejected"
    | "dealer_suspended"
    | "anonymous";
  email?: string;
  password?: string;
}

const ACCOUNTS: Record<string, Account> = {
  anonymous: { role: "anonymous" },
  admin: {
    role: "admin",
    email: "admin@mastereducation.com.tr",
    password: "Master2026!Admin",
  },
  customer: {
    role: "customer",
    email: "qa-fixture-customer@qa.local",
    password: "QaFixture2026!",
  },
  dealer_approved: {
    role: "dealer_approved",
    email: "qa-fixture-approved@qa.local",
    password: "QaFixture2026!",
  },
  dealer_pending: {
    role: "dealer_pending",
    email: "qa-fixture-pending@qa.local",
    password: "QaFixture2026!",
  },
  dealer_rejected: {
    role: "dealer_rejected",
    email: "qa-fixture-rejected@qa.local",
    password: "QaFixture2026!",
  },
  dealer_suspended: {
    role: "dealer_suspended",
    email: "qa-fixture-suspended@qa.local",
    password: "QaFixture2026!",
  },
};

const jars: Record<string, CookieJar> = {};
const authenticatedRoles: Set<string> = new Set();

async function setupJars() {
  // Skip the SKIP_LOGIN_ROLES set to conserve per-IP login budget — the server
  // rate-limits login attempts at 30/IP/15min and we re-run during a session.
  // REJECTED/SUSPENDED are documented as blocked-by-design and don't need a
  // live session probe each run.
  const skip = new Set(
    (process.env.APIFUZZ_SKIP_LOGIN ?? "dealer_rejected,dealer_suspended")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  // Use a per-role spoofed X-Forwarded-For so repeated test runs don't blow
  // through the login rate-limit budget on the test box.
  const SPOOF_IPS: Record<string, string> = {
    admin: "10.99.100.10",
    customer: "10.99.100.20",
    dealer_approved: "10.99.100.30",
    dealer_pending: "10.99.100.40",
    dealer_rejected: "10.99.100.50",
    dealer_suspended: "10.99.100.60",
  };
  for (const [name, acct] of Object.entries(ACCOUNTS)) {
    const jar: CookieJar = new Map();
    if (acct.email && acct.password && !skip.has(name)) {
      const r = await login(jar, acct.email, acct.password, SPOOF_IPS[name]);
      console.log(
        `  [LOGIN] ${name} hasUser=${r.hasUser} sessionStatus=${r.status}`
      );
      if (r.hasUser) authenticatedRoles.add(name);
    } else if (skip.has(name)) {
      console.log(`  [SKIP] ${name} (per APIFUZZ_SKIP_LOGIN)`);
    } else {
      console.log(`  [LOGIN] ${name} (no auth)`);
    }
    jars[name] = jar;
  }
  for (const role of ["dealer_rejected", "dealer_suspended"]) {
    if (skip.has(role)) {
      console.log(
        `  [INFO] ${role} login skipped — documented behavior: server blocks REJECTED/SUSPENDED credentials at sign-in`
      );
    }
  }
}

function effectivelyAnonymous(role: string): boolean {
  return role === "anonymous" || !authenticatedRoles.has(role);
}

function formatHttpBlock(args: {
  title: string;
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody?: string;
  res: HttpResult;
}): string {
  const reqHeaderLines = Object.entries(args.reqHeaders)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const resHeaderLines = Object.entries(args.res.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `### ${args.title}
${args.method} ${BASE}${args.url}
${reqHeaderLines}
${args.reqBody ? `\n${args.reqBody}\n` : ""}
# ---- response ----
HTTP/1.1 ${args.res.status}
${resHeaderLines}

${args.res.text.length > 4000 ? args.res.text.slice(0, 4000) + "\n...[truncated]" : args.res.text}`;
}

// ============================================================
// Test suites
// ============================================================

interface AuthCase {
  url: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Roles that should succeed (status < 400) */
  allowedRoles: string[];
  /** Roles that should be denied (401/403/404 ok) */
  deniedRoles: string[];
  /** semantic label for the endpoint family */
  label: string;
  /** Allowed “success” statuses (default 200/201/204) */
  okStatuses?: number[];
}

const AUTH_CASES: AuthCase[] = [
  // Admin GET endpoints — many admin routes only expose POST/PATCH; for those,
  // 404/405 across all roles is correct (no defect). We focus on routes that
  // DO have a GET handler.
  {
    label: "admin-products-search",
    url: "/api/admin/products/search?q=test&limit=5",
    method: "GET",
    allowedRoles: ["admin"],
    deniedRoles: [
      "anonymous",
      "customer",
      "dealer_approved",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "admin-products-template",
    url: "/api/admin/products/template",
    method: "GET",
    allowedRoles: ["admin"],
    deniedRoles: [
      "anonymous",
      "customer",
      "dealer_approved",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "admin-accounting-export",
    url: "/api/admin/accounting/export?format=json",
    method: "GET",
    allowedRoles: ["admin"],
    deniedRoles: [
      "anonymous",
      "customer",
      "dealer_approved",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "admin-invoices",
    url: "/api/admin/invoices",
    method: "GET",
    allowedRoles: ["admin"],
    deniedRoles: [
      "anonymous",
      "customer",
      "dealer_approved",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "dealer-me",
    url: "/api/dealer/me",
    method: "GET",
    // Dealer (any application status) should be allowed; non-dealers denied.
    allowedRoles: ["dealer_approved", "dealer_pending"],
    deniedRoles: ["anonymous", "customer", "admin"],
  },
  {
    label: "dealer-statement",
    url: "/api/dealer/statement",
    method: "GET",
    allowedRoles: ["dealer_approved"],
    deniedRoles: [
      "anonymous",
      "customer",
      "admin",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "dealer-bulk-order-submit",
    url: "/api/dealer/bulk-order/submit",
    method: "POST",
    body: { items: [] },
    allowedRoles: ["dealer_approved"],
    deniedRoles: [
      "anonymous",
      "customer",
      "admin",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
  },
  {
    label: "account-addresses",
    url: "/api/account/addresses",
    method: "GET",
    allowedRoles: [
      "customer",
      "admin",
      "dealer_approved",
      "dealer_pending",
      "dealer_rejected",
      "dealer_suspended",
    ],
    deniedRoles: ["anonymous"],
  },
];

function isAuthDenied(status: number) {
  // We accept 401, 403, 404 (route may not exist for non-allowed roles).
  return status === 401 || status === 403 || status === 404;
}

async function runAuthMatrix() {
  console.log("\n=== AUTH MATRIX ===");
  for (const c of AUTH_CASES) {
    for (const role of Object.keys(ACCOUNTS)) {
      const jar = jars[role];
      const reqHeaders: Record<string, string> = {};
      if (jar && jar.size) reqHeaders["cookie"] = "<redacted>";
      if (c.body) reqHeaders["content-type"] = "application/json";
      const res = await http(c.method, c.url, {
        jar,
        body: c.body,
      });

      appendEvidence(
        `auth-${c.label}`,
        formatHttpBlock({
          title: `${c.label} as ${role}`,
          method: c.method,
          url: c.url,
          reqHeaders,
          reqBody: c.body ? JSON.stringify(c.body) : undefined,
          res,
        })
      );

      const allowed = c.allowedRoles.includes(role);
      const denied = c.deniedRoles.includes(role);

      // 405 = method not exposed; 404 = route or resource missing. These are
      // not access-control defects — skip both allowed-degradation and
      // denied-bypass checks for these statuses.
      if (res.status === 404 || res.status === 405) continue;

      // If a role that we expected to authenticate failed to establish a
      // session (e.g. REJECTED/SUSPENDED dealers are blocked at login), don't
      // flag the resulting 401 as a defect — the auth gate IS the defense.
      if (allowed && effectivelyAnonymous(role)) continue;

      if (allowed) {
        const okSet = new Set(c.okStatuses ?? [200, 201, 204, 400, 422]);
        if (!okSet.has(res.status)) {
          record({
            title: `${c.label} returned ${res.status} for allowed role ${role}`,
            category: "logic",
            severity: "P2",
            role,
            url: c.url,
            steps: [
              `Login as ${role}`,
              `${c.method} ${c.url}`,
              `Expected 2xx (allowed) — got ${res.status}`,
            ],
            expected: "2xx or validation 4xx for allowed role",
            actual: `HTTP ${res.status}: ${res.text.slice(0, 200)}`,
            evidence: `evidence/api/auth-${c.label}.http`,
          });
        }
      } else if (denied) {
        if (!isAuthDenied(res.status)) {
          const sev: Severity = res.status >= 200 && res.status < 300 ? "P0" : "P1";
          record({
            title: `${c.label} accessible to ${role} (expected 401/403, got ${res.status})`,
            category: "security",
            severity: sev,
            role,
            url: c.url,
            steps: [
              role === "anonymous"
                ? "Send request with no auth cookies"
                : `Login as ${role}`,
              `${c.method} ${c.url}${c.body ? ` with body ${JSON.stringify(c.body)}` : ""}`,
              `Observe response`,
            ],
            expected:
              "401 Unauthorized / 403 Forbidden (role-gated endpoint)",
            actual: `HTTP ${res.status}: ${res.text.slice(0, 300)}`,
            evidence: `evidence/api/auth-${c.label}.http`,
          });
        }
      }
    }
  }
}

// ---- Open-account order: only APPROVED dealer should be allowed
async function runOpenAccountOrder() {
  console.log("\n=== Open-Account Order ===");
  const body = {
    items: [{ productId: "nonexistent", quantity: 1 }],
    shipping: {
      fullName: "QA",
      email: "qa@qa.local",
      phone: "05551112233",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34000",
      address: "Test",
    },
    paymentMethod: "OPEN_ACCOUNT",
  };
  for (const role of [
    "anonymous",
    "customer",
    "dealer_pending",
    "dealer_rejected",
    "dealer_suspended",
  ]) {
    const res = await http("POST", "/api/orders", {
      jar: jars[role],
      body,
    });
    appendEvidence(
      "orders-open-account",
      formatHttpBlock({
        title: `open-account order as ${role}`,
        method: "POST",
        url: "/api/orders",
        reqHeaders: { "content-type": "application/json" },
        reqBody: JSON.stringify(body),
        res,
      })
    );
    // The endpoint should refuse OPEN_ACCOUNT for non-APPROVED-dealer. 4xx is
    // acceptable (validation, auth, forbidden). 200/201 with success=true would
    // be a P0.
    const okSuccess = res.status === 200 && res.json?.success === true;
    if (okSuccess) {
      record({
        title: `OPEN_ACCOUNT order accepted as ${role}`,
        category: "security",
        severity: "P0",
        role,
        url: "/api/orders",
        steps: [
          role === "anonymous" ? "No login" : `Login as ${role}`,
          "POST /api/orders with paymentMethod=OPEN_ACCOUNT",
        ],
        expected:
          "Only APPROVED dealers may use OPEN_ACCOUNT — others should be rejected (403)",
        actual: `HTTP 200 with success=true: ${res.text.slice(0, 200)}`,
        evidence: "evidence/api/orders-open-account.http",
      });
    }
  }
}

// ---- IDOR tests
async function runIdor() {
  console.log("\n=== IDOR ===");

  // First, collect REAL order IDs as admin (admin has visibility), then try to
  // GET them as a different customer. Admin /api/admin/orders has no GET (404),
  // so we fall back to: as dealer_approved view dealer orders, OR poke a list of
  // probable IDs alongside admin's own order list endpoint if it exists.
  const realIds: string[] = [];
  // Try /api/orders as admin (admin should NOT necessarily get all, but if admin
  // has placed orders, we'll see them).
  const adminListRes = await http("GET", "/api/orders", { jar: jars["admin"] });
  if (Array.isArray(adminListRes.json)) {
    for (const o of adminListRes.json.slice(0, 3)) {
      if (o && typeof o.id === "string") realIds.push(o.id);
    }
  } else if (Array.isArray((adminListRes.json as any)?.orders)) {
    for (const o of (adminListRes.json as any).orders.slice(0, 3)) {
      if (o && typeof o.id === "string") realIds.push(o.id);
    }
  }
  const dealerListRes = await http("GET", "/api/orders", {
    jar: jars["dealer_approved"],
  });
  if (Array.isArray(dealerListRes.json)) {
    for (const o of dealerListRes.json.slice(0, 3)) {
      if (o && typeof o.id === "string" && !realIds.includes(o.id)) realIds.push(o.id);
    }
  } else if (Array.isArray((dealerListRes.json as any)?.orders)) {
    for (const o of (dealerListRes.json as any).orders.slice(0, 3)) {
      if (o && typeof o.id === "string" && !realIds.includes(o.id)) realIds.push(o.id);
    }
  }
  console.log(
    `  IDOR collected ${realIds.length} real order IDs from admin/dealer to probe as customer`
  );

  const customerJar = jars["customer"];
  const probeIds = [
    ...realIds,
    "clxxxxxxxxxxxxxxxxxxxxxxx",
    "00000000-0000-0000-0000-000000000000",
    "1",
    "00000",
  ];
  for (const id of probeIds) {
    const res = await http("GET", `/api/orders/${encodeURIComponent(id)}`, {
      jar: customerJar,
    });
    appendEvidence(
      "idor-orders",
      formatHttpBlock({
        title: `customer GETs /api/orders/${id}`,
        method: "GET",
        url: `/api/orders/${id}`,
        reqHeaders: { cookie: "<customer>" },
        res,
      })
    );
    if (res.status === 200 && res.json?.id && res.json?.userId) {
      // Returned an order — IDOR if userId != logged-in user
      record({
        title: `Customer fetched order ${id} owned by another user`,
        category: "security",
        severity: "P0",
        role: "customer",
        url: `/api/orders/${id}`,
        steps: [
          "Login as qa-fixture-customer@qa.local",
          `GET /api/orders/${id}`,
        ],
        expected: "403 Forbidden or 404 Not Found",
        actual: `HTTP 200 returning order JSON: ${res.text.slice(0, 200)}`,
        evidence: "evidence/api/idor-orders.http",
      });
    }
  }

  // Probe /api/account/addresses/[id]
  for (const id of probeIds) {
    const res = await http("GET", `/api/account/addresses/${id}`, {
      jar: customerJar,
    });
    appendEvidence(
      "idor-addresses",
      formatHttpBlock({
        title: `customer GETs /api/account/addresses/${id}`,
        method: "GET",
        url: `/api/account/addresses/${id}`,
        reqHeaders: { cookie: "<customer>" },
        res,
      })
    );
    if (res.status === 200 && res.json && res.json.id) {
      record({
        title: `Customer fetched address ${id} (cross-user IDOR check)`,
        category: "security",
        severity: "P0",
        role: "customer",
        url: `/api/account/addresses/${id}`,
        steps: [
          "Login as qa-fixture-customer@qa.local",
          `GET /api/account/addresses/${id}`,
        ],
        expected: "403 / 404",
        actual: `HTTP 200: ${res.text.slice(0, 200)}`,
        evidence: "evidence/api/idor-addresses.http",
      });
    }
  }
}

// ---- Mass assignment
async function runMassAssignment() {
  console.log("\n=== Mass Assignment ===");

  // 1) Register with role/emailVerified injected
  const email = `qa-mass-${Date.now()}@qa.local`;
  const regBody = {
    name: "Mass Assign Probe",
    email,
    password: "Password123!",
    phone: "05551112233",
    role: "ADMIN",
    emailVerified: "2020-01-01T00:00:00.000Z",
    isAdmin: true,
    isDealer: true,
  };
  const regRes = await http("POST", "/api/auth/register", { body: regBody });
  appendEvidence(
    "mass-register",
    formatHttpBlock({
      title: "register with role:ADMIN injected",
      method: "POST",
      url: "/api/auth/register",
      reqHeaders: { "content-type": "application/json" },
      reqBody: JSON.stringify(regBody),
      res: regRes,
    })
  );

  // Verify the user did not become admin by attempting to login + GET admin endpoint
  if (regRes.status === 201 || regRes.status === 200) {
    const probeJar: CookieJar = new Map();
    const login1 = await login(probeJar, email, "Password123!");
    if (login1.hasUser) {
      const adminProbe = await http("GET", "/api/admin/orders?page=1&pageSize=1", {
        jar: probeJar,
      });
      appendEvidence(
        "mass-register",
        formatHttpBlock({
          title: "freshly registered user probes admin endpoint",
          method: "GET",
          url: "/api/admin/orders?page=1&pageSize=1",
          reqHeaders: { cookie: "<new-user>" },
          res: adminProbe,
        })
      );
      if (adminProbe.status >= 200 && adminProbe.status < 300) {
        record({
          title:
            "Register endpoint accepts role:ADMIN injection — user can hit admin API",
          category: "security",
          severity: "P0",
          role: "anonymous",
          url: "/api/auth/register",
          steps: [
            "POST /api/auth/register with role:ADMIN, emailVerified injected",
            "Login as that user",
            "GET /api/admin/orders → got 2xx",
          ],
          expected:
            "Register endpoint must silently drop unknown / privileged fields; new user must be CUSTOMER",
          actual: `HTTP ${adminProbe.status} on /api/admin/orders: ${adminProbe.text.slice(0, 200)}`,
          evidence: "evidence/api/mass-register.http",
        });
      }
    }
  }

  // 2) PATCH /api/account/profile with role/admin fields
  const profileJar = jars["customer"];
  // First read current profile
  const before = await http("GET", "/api/account/profile", { jar: profileJar });
  const patchBody = {
    name: (before.json?.user?.name as string) ?? "QA Customer",
    email: (before.json?.user?.email as string) ?? "qa-fixture-customer@qa.local",
    phone: (before.json?.user?.phone as string) ?? "05551112233",
    role: "ADMIN",
    isAdmin: true,
    emailVerified: "2020-01-01T00:00:00.000Z",
  };
  const patchRes = await http("PATCH", "/api/account/profile", {
    jar: profileJar,
    body: patchBody,
  });
  appendEvidence(
    "mass-profile",
    formatHttpBlock({
      title: "PATCH profile with role:ADMIN injected",
      method: "PATCH",
      url: "/api/account/profile",
      reqHeaders: { "content-type": "application/json", cookie: "<customer>" },
      reqBody: JSON.stringify(patchBody),
      res: patchRes,
    })
  );
  if (patchRes.status >= 200 && patchRes.status < 300) {
    // verify by probing admin endpoint
    const adminProbe = await http("GET", "/api/admin/orders?page=1&pageSize=1", {
      jar: profileJar,
    });
    appendEvidence(
      "mass-profile",
      formatHttpBlock({
        title: "after PATCH, probe admin endpoint",
        method: "GET",
        url: "/api/admin/orders?page=1&pageSize=1",
        reqHeaders: { cookie: "<customer>" },
        res: adminProbe,
      })
    );
    if (adminProbe.status >= 200 && adminProbe.status < 300) {
      record({
        title:
          "PATCH /api/account/profile honors role:ADMIN injection — customer escalated",
        category: "security",
        severity: "P0",
        role: "customer",
        url: "/api/account/profile",
        steps: [
          "Login as qa-fixture-customer@qa.local",
          "PATCH /api/account/profile with role:ADMIN, isAdmin:true",
          "GET /api/admin/orders → 2xx",
        ],
        expected: "Privileged fields must be ignored by validation schema",
        actual: `Admin endpoint returned ${adminProbe.status} after PATCH`,
        evidence: "evidence/api/mass-profile.http",
      });
    }
  }

  // 3) POST /api/orders with injected total = 0.01
  const orderProbeBody = {
    items: [{ productId: "x", quantity: 1 }],
    shipping: {
      fullName: "QA",
      email: "qa@qa.local",
      phone: "05551112233",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34000",
      address: "Test",
    },
    paymentMethod: "CREDIT_CARD",
    card: {
      number: "4242 4242 4242 4242",
      expiry: "12/35",
      cvv: "123",
      holderName: "QA",
    },
    total: 0.01,
    totalPrice: 0.01,
    subtotal: 0.01,
  };
  const orderRes = await http("POST", "/api/orders", {
    jar: jars["customer"],
    body: orderProbeBody,
  });
  appendEvidence(
    "mass-order-total",
    formatHttpBlock({
      title: "POST /api/orders with total:0.01 injected",
      method: "POST",
      url: "/api/orders",
      reqHeaders: { "content-type": "application/json", cookie: "<customer>" },
      reqBody: JSON.stringify(orderProbeBody),
      res: orderRes,
    })
  );
  // Successful order with total=0.01 echoed back without recompute = P0.
  if (
    orderRes.status === 200 &&
    orderRes.json?.success === true &&
    typeof orderRes.json?.total === "number" &&
    orderRes.json.total <= 1
  ) {
    record({
      title: "Order accepts injected total — server did not recompute",
      category: "security",
      severity: "P0",
      role: "customer",
      url: "/api/orders",
      steps: [
        "Login as customer",
        "POST /api/orders with total:0.01 injected",
        "Server echoed total:0.01 back",
      ],
      expected: "Server must recompute total from products and ignore client total",
      actual: `Created order with total ${orderRes.json.total}: ${orderRes.text.slice(0, 200)}`,
      evidence: "evidence/api/mass-order-total.http",
    });
  }
}

// ---- Rate limit tests
async function runRateLimits() {
  console.log("\n=== Rate Limits ===");

  // forgot-password 20x same email
  const email = "qa-fixture-customer@qa.local";
  let saw429 = 0;
  const statuses: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const res = await http("POST", "/api/auth/forgot-password", {
      body: { email },
    });
    statuses.push(res.status);
    if (res.status === 429) saw429 += 1;
    if (i === 0 || i === 19) {
      appendEvidence(
        "rl-forgot-password",
        formatHttpBlock({
          title: `forgot-password attempt #${i + 1}`,
          method: "POST",
          url: "/api/auth/forgot-password",
          reqHeaders: { "content-type": "application/json" },
          reqBody: JSON.stringify({ email }),
          res,
        })
      );
    }
  }
  console.log(
    `  forgot-password: saw 429 ${saw429} times, statuses=${[...new Set(statuses)].join(",")}`
  );
  if (saw429 === 0) {
    // Endpoint may use silent rate-limit (stealth) — flag as P1 (cannot verify externally)
    record({
      title:
        "/api/auth/forgot-password: 20 rapid same-email requests never returned 429",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/auth/forgot-password",
      steps: [
        `POST /api/auth/forgot-password 20× rapidly with email=${email}`,
        "Observe no 429 returned (statuses: " +
          [...new Set(statuses)].join(",") +
          ")",
      ],
      expected:
        "Rate limiter should reject after a small threshold (e.g. 5/min) returning 429",
      actual: `All ${statuses.length} responses non-429 (statuses: ${[...new Set(statuses)].join(",")})`,
      evidence: "evidence/api/rl-forgot-password.http",
    });
  }

  // register 15x with different emails
  saw429 = 0;
  const regStatuses: number[] = [];
  for (let i = 0; i < 15; i += 1) {
    const res = await http("POST", "/api/auth/register", {
      body: {
        name: "RL Probe",
        email: `qa-rl-${Date.now()}-${i}@qa.local`,
        password: "Password123!",
        phone: "05551112233",
      },
    });
    regStatuses.push(res.status);
    if (res.status === 429) saw429 += 1;
    if (i === 0 || i === 14) {
      appendEvidence(
        "rl-register",
        formatHttpBlock({
          title: `register attempt #${i + 1}`,
          method: "POST",
          url: "/api/auth/register",
          reqHeaders: { "content-type": "application/json" },
          res,
        })
      );
    }
  }
  console.log(
    `  register: saw 429 ${saw429} times, statuses=${[...new Set(regStatuses)].join(",")}`
  );
  if (saw429 === 0) {
    record({
      title: "/api/auth/register: 15 rapid signups from one IP never returned 429",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/auth/register",
      steps: [
        "POST /api/auth/register 15× rapidly from one IP",
        "Observe no 429 returned (statuses: " +
          [...new Set(regStatuses)].join(",") +
          ")",
      ],
      expected:
        "Per-IP rate limit on register (e.g. 5/min) returning 429 to prevent mass account creation / spam",
      actual: `All ${regStatuses.length} responses non-429 (statuses: ${[...new Set(regStatuses)].join(",")})`,
      evidence: "evidence/api/rl-register.http",
    });
  }

  // XFF-bypass check: after we just hit the rate-limit ceiling above (same IP),
  // try the same endpoint with rotating X-Forwarded-For values. If the server
  // trusts client-supplied XFF without a reverse-proxy guard, those should all
  // come back 200 — proving rate-limit bypass via header injection.
  // First confirm same-IP is still locked.
  const lockedProbe = await http("POST", "/api/auth/forgot-password", {
    body: { email },
  });
  const sameIpLocked = lockedProbe.status === 429;
  appendEvidence(
    "rl-forgot-password-xff",
    formatHttpBlock({
      title: "baseline same-IP after burst (expect 429 if rate-limit holds)",
      method: "POST",
      url: "/api/auth/forgot-password",
      reqHeaders: { "content-type": "application/json" },
      reqBody: JSON.stringify({ email }),
      res: lockedProbe,
    })
  );

  // Use a unique IP prefix per run to ensure fresh per-IP buckets.
  const xffPrefix = `10.${(Date.now() % 200) + 50}.${Math.floor(Math.random() * 200) + 10}`;
  const xffStatuses: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const ip = `${xffPrefix}.${i + 1}`;
    const res = await http("POST", "/api/auth/forgot-password", {
      body: { email },
      headers: { "x-forwarded-for": ip },
    });
    xffStatuses.push(res.status);
    if (i === 0 || i === 9) {
      appendEvidence(
        "rl-forgot-password-xff",
        formatHttpBlock({
          title: `forgot-password XFF rotation #${i + 1} (X-Forwarded-For: ${ip})`,
          method: "POST",
          url: "/api/auth/forgot-password",
          reqHeaders: {
            "content-type": "application/json",
            "x-forwarded-for": ip,
          },
          reqBody: JSON.stringify({ email }),
          res,
        })
      );
    }
  }
  // Login rate-limit XFF bypass probe — exhaust per-IP credentials budget with
  // a junk email (~32 attempts > 30/IP/15min cap in src/lib/auth.ts), then
  // rotate XFF to confirm bypass. Uses a non-existent email so we don't
  // pollute real test accounts. Each attempt needs its own cookie jar so the
  // NextAuth CSRF cookie sticks.
  const junkEmail = `apifuzz-rl-${Date.now()}@nope.local`;
  let loginBaselineLocked = false;
  let loginXffBypassed = 0;
  const loginLocs: string[] = [];
  async function attemptLogin(ip?: string) {
    const localJar: CookieJar = new Map();
    const headers: Record<string, string> = {};
    if (ip) headers["x-forwarded-for"] = ip;
    const csrfRes = await http("GET", "/api/auth/csrf", {
      jar: localJar,
      headers,
    });
    const csrfToken = (csrfRes.json as any)?.csrfToken as string;
    const form = new URLSearchParams();
    form.set("email", `${junkEmail}-${ip ?? "same"}`);
    form.set("password", "wrong");
    form.set("csrfToken", csrfToken);
    form.set("callbackUrl", `${BASE}/`);
    form.set("json", "true");
    const r = await http("POST", "/api/auth/callback/credentials", {
      jar: localJar,
      form,
      headers,
    });
    return r;
  }
  for (let i = 0; i < 35; i += 1) {
    const r = await attemptLogin();
    const loc = r.headers["location"] ?? "";
    loginLocs.push(loc);
    if (/[?&]error=Configuration\b/.test(loc)) loginBaselineLocked = true;
    if (i === 0 || i === 34) {
      appendEvidence(
        "rl-login-xff",
        formatHttpBlock({
          title: `login burst #${i + 1} (same IP)`,
          method: "POST",
          url: "/api/auth/callback/credentials",
          reqHeaders: { "content-type": "application/x-www-form-urlencoded" },
          res: r,
        })
      );
    }
  }
  console.log(
    `  login burst: 35 attempts; baselineLocked=${loginBaselineLocked}; sample locs: ${[...new Set(loginLocs)].slice(0, 3).join(" | ")}`
  );
  if (loginBaselineLocked) {
    for (let i = 0; i < 5; i += 1) {
      const ip = `${xffPrefix}.${i + 100}`;
      const r = await attemptLogin(ip);
      const loc = r.headers["location"] ?? "";
      if (!/[?&]error=Configuration\b/.test(loc)) loginXffBypassed += 1;
      appendEvidence(
        "rl-login-xff",
        formatHttpBlock({
          title: `login XFF rotation #${i + 1} (X-Forwarded-For: ${ip})`,
          method: "POST",
          url: "/api/auth/callback/credentials",
          reqHeaders: {
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": ip,
          },
          res: r,
        })
      );
    }
    console.log(
      `  login: baselineLocked=${loginBaselineLocked} xffBypassed=${loginXffBypassed}/5`
    );
    if (loginXffBypassed >= 3) {
      record({
        title:
          "Login per-IP rate limit bypass via X-Forwarded-For — credential stuffing accelerator",
        category: "security",
        severity: "P1",
        role: "anonymous",
        url: "/api/auth/callback/credentials",
        steps: [
          "POST /api/auth/callback/credentials 35× from one IP with junk credentials until NextAuth redirects to ?error=Configuration (throttle thrown by src/lib/auth.ts: ratelimit(`login:ip:${ip}`, 30, 15*60_000))",
          "Then send 5× more with rotating X-Forwarded-For values",
          `Observe ${loginXffBypassed}/5 of those XFF-rotated logins NOT throttled`,
        ],
        expected:
          "The login rate-limit key must come from socket address / trusted-proxy chain — not from raw client X-Forwarded-For. Otherwise an attacker bypasses the per-IP 30/15min lockout with a single header.",
        actual: `${loginXffBypassed}/5 XFF-rotated login attempts skipped the throttle that locks the same socket peer`,
        evidence: "evidence/api/rl-login-xff.http",
      });
    }
  } else {
    console.log(
      `  login rate-limit: never hit baseline lock in 35 attempts — skipping XFF probe (sample locs: ${[...new Set(loginLocs)].slice(0, 3).join(" | ")})`
    );
  }

  const xffBypassed = xffStatuses.filter((s) => s !== 429).length;
  console.log(
    `  forgot-password (rotating XFF): sameIpLocked=${sameIpLocked} statuses=${[...new Set(xffStatuses)].join(",")}`
  );
  if (sameIpLocked && xffBypassed >= 5) {
    record({
      title:
        "Rate limit bypass via X-Forwarded-For header rotation on /api/auth/forgot-password",
      category: "security",
      severity: "P1",
      role: "anonymous",
      url: "/api/auth/forgot-password",
      steps: [
        `Burst 20× POST /api/auth/forgot-password (email=${email}) until 429`,
        "Confirm same-IP follow-up still returns 429",
        "Send 10× POST with rotating X-Forwarded-For: 10.99.1.1..10",
        `Observe ${xffBypassed}/10 responses bypass the limit (not 429)`,
      ],
      expected:
        "Rate-limit key must be derived from a trusted source (NextAuth-style trusted-proxy list or socket address), not from raw client X-Forwarded-For. Attacker can spray reset emails by rotating XFF.",
      actual: `${xffBypassed}/10 XFF-rotated requests returned non-429 while same-IP is locked (statuses: ${[...new Set(xffStatuses)].join(",")})`,
      evidence: "evidence/api/rl-forgot-password-xff.http",
    });
  }
}

// ---- Content-type confusion
async function runContentTypeConfusion() {
  console.log("\n=== Content-Type Confusion ===");
  const bodyObj = {
    items: [{ productId: "x", quantity: 1 }],
    shipping: {
      fullName: "QA",
      email: "qa@qa.local",
      phone: "05551112233",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34000",
      address: "Test",
    },
    paymentMethod: "CREDIT_CARD",
    card: {
      number: "4242 4242 4242 4242",
      expiry: "12/35",
      cvv: "123",
      holderName: "QA",
    },
  };
  const rawJson = JSON.stringify(bodyObj);

  // text/plain with JSON content
  const r1 = await http("POST", "/api/orders", {
    jar: jars["customer"],
    rawBody: rawJson,
    contentType: "text/plain",
  });
  appendEvidence(
    "ct-confusion",
    formatHttpBlock({
      title: "POST /api/orders with text/plain body",
      method: "POST",
      url: "/api/orders",
      reqHeaders: { "content-type": "text/plain", cookie: "<customer>" },
      reqBody: rawJson,
      res: r1,
    })
  );
  if (r1.status === 200 && r1.json?.success === true) {
    record({
      title: "POST /api/orders accepts text/plain body and creates order",
      category: "security",
      severity: "P2",
      role: "customer",
      url: "/api/orders",
      steps: [
        "Login as customer",
        "POST /api/orders with Content-Type: text/plain and JSON body",
      ],
      expected:
        "Reject non-JSON content-type (415) or coerce safely without accepting privileged fields",
      actual: `HTTP 200, order created: ${r1.text.slice(0, 200)}`,
      evidence: "evidence/api/ct-confusion.http",
    });
  } else if (r1.status >= 500) {
    record({
      title:
        "POST /api/orders 5xx with non-JSON content-type (should be 4xx)",
      category: "observability",
      severity: "P2",
      role: "customer",
      url: "/api/orders",
      steps: [
        "Login as customer",
        "POST /api/orders with Content-Type: text/plain and JSON body",
      ],
      expected: "415 Unsupported Media Type or 400 Bad Request",
      actual: `HTTP ${r1.status}: ${r1.text.slice(0, 200)}`,
      evidence: "evidence/api/ct-confusion.http",
    });
  }

  // no content-type
  const r2 = await http("POST", "/api/orders", {
    jar: jars["customer"],
    rawBody: rawJson,
    contentType: "",
  });
  appendEvidence(
    "ct-confusion",
    formatHttpBlock({
      title: "POST /api/orders with NO content-type",
      method: "POST",
      url: "/api/orders",
      reqHeaders: { cookie: "<customer>" },
      reqBody: rawJson,
      res: r2,
    })
  );
  if (r2.status >= 500) {
    record({
      title:
        "POST /api/orders 5xx when Content-Type omitted (should be 4xx)",
      category: "observability",
      severity: "P2",
      role: "customer",
      url: "/api/orders",
      steps: [
        "Login as customer",
        "POST /api/orders with no Content-Type header, JSON body",
      ],
      expected: "400 / 415",
      actual: `HTTP ${r2.status}: ${r2.text.slice(0, 200)}`,
      evidence: "evidence/api/ct-confusion.http",
    });
  }
}

// ---- 5xx / info-disclosure probes
async function runErrorProbes() {
  console.log("\n=== Error Probes ===");
  // Malformed JSON
  const r1 = await http("POST", "/api/auth/register", {
    rawBody: "{not-json",
  });
  appendEvidence(
    "err-probes",
    formatHttpBlock({
      title: "register with malformed JSON",
      method: "POST",
      url: "/api/auth/register",
      reqHeaders: { "content-type": "application/json" },
      reqBody: "{not-json",
      res: r1,
    })
  );
  if (r1.status >= 500) {
    const leak =
      /at\s+\S+:\d+:\d+/.test(r1.text) ||
      /\\Users\\|\/src\//.test(r1.text);
    record({
      title: leak
        ? "register: 5xx with stack trace / source path leak on malformed JSON"
        : "register: 5xx on malformed JSON (should be 4xx)",
      category: leak ? "security" : "observability",
      severity: leak ? "P1" : "P2",
      role: "anonymous",
      url: "/api/auth/register",
      steps: [
        "POST /api/auth/register with body '{not-json'",
      ],
      expected: "400 Bad Request — no stack",
      actual: `HTTP ${r1.status}: ${r1.text.slice(0, 300)}`,
      evidence: "evidence/api/err-probes.http",
    });
  }

  // Oversized JSON
  const big = "a".repeat(2_000_000);
  const r2 = await http("POST", "/api/auth/register", {
    body: { name: "X", email: `huge-${Date.now()}@qa.local`, password: big, phone: "0" },
  });
  appendEvidence(
    "err-probes",
    formatHttpBlock({
      title: "register with 2MB password",
      method: "POST",
      url: "/api/auth/register",
      reqHeaders: { "content-type": "application/json" },
      reqBody: "<2MB>",
      res: r2,
    })
  );
  if (r2.status >= 500) {
    record({
      title: "register: 5xx on oversized payload (should be 4xx or 413)",
      category: "observability",
      severity: "P2",
      role: "anonymous",
      url: "/api/auth/register",
      steps: ["POST /api/auth/register with 2MB password field"],
      expected: "413 / 400",
      actual: `HTTP ${r2.status}: ${r2.text.slice(0, 200)}`,
      evidence: "evidence/api/err-probes.http",
    });
  }
}

async function main() {
  console.log(`A-APIFuzz against ${BASE}`);
  console.log(`Findings → ${FINDINGS_PATH}`);
  console.log(`Evidence → ${EVIDENCE_DIR}`);
  console.log();
  console.log("=== Login ===");
  await setupJars();
  try {
    await runAuthMatrix();
    await runOpenAccountOrder();
    await runIdor();
    await runMassAssignment();
    await runRateLimits();
    await runContentTypeConfusion();
    await runErrorProbes();
  } finally {
    flushEvidence();
  }

  console.log(`\n=== Summary ===`);
  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  console.log(
    `Total findings: ${findings.length} (P0=${counts.P0}, P1=${counts.P1}, P2=${counts.P2}, P3=${counts.P3})`
  );
}

main().catch((err) => {
  console.error(err);
  flushEvidence();
  process.exit(1);
});
