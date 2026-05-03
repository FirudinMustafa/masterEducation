/**
 * End-to-end scenario runner.
 *
 * Drives the running dev server over HTTP the way a real user would:
 *   - customer register → browse → add-to-cart → checkout
 *   - dealer apply → admin approve → order with OPEN_ACCOUNT → cancel
 *   - admin issues per-dealer discounts → dealer sees dealer price
 *   - rate limits kick in on brute-force
 *   - invalid transitions reject cleanly
 *
 * Run with:  npm run scenarios
 * Requires:  dev server on http://localhost:3000 + seeded DB.
 */

import "dotenv/config";
import { prisma } from "../../src/lib/prisma";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function log(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`  [${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

type CookieJar = Map<string, string>;

function updateJar(jar: CookieJar, headers: Headers) {
  const setCookies = headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!value || value === "" || value === "deleted") {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function http(
  method: string,
  path: string,
  {
    body,
    jar,
    form,
  }: { body?: unknown; jar?: CookieJar; form?: URLSearchParams } = {}
) {
  const headers: Record<string, string> = {};
  if (jar && jar.size > 0) headers["cookie"] = cookieHeader(jar);
  let payload: BodyInit | undefined;
  if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = form;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  if (jar) updateJar(jar, res.headers);
  return res;
}

async function login(jar: CookieJar, email: string, password: string) {
  const csrfRes = await http("GET", "/api/auth/csrf", { jar });
  const csrfData = (await csrfRes.json()) as { csrfToken: string };

  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);
  form.set("csrfToken", csrfData.csrfToken);
  form.set("callbackUrl", `${BASE}/`);
  form.set("json", "true");

  const res = await http("POST", "/api/auth/callback/credentials", {
    jar,
    form,
  });
  const session = await http("GET", "/api/auth/session", { jar });
  const data = (await session.json()) as { user?: unknown };
  return { status: res.status, hasSession: !!data.user };
}

async function cleanupTestData() {
  // Reset FAZ 5 state
  await prisma.coupon.deleteMany({ where: { code: { startsWith: "E2E-" } } });
  await prisma.productReview.deleteMany({
    where: { user: { email: { contains: "@test.local" } } },
  });

  // Repeated runs deplete stock — re-stock low-stock products so scenarios
  // find something to order.
  await prisma.product.updateMany({
    where: { stockQuantity: { lt: 50 }, isPublished: true, price: { gt: 0 } },
    data: { stockQuantity: 100 },
  });

  // FAZ 6: trim mock pageviews / errors from earlier runs.
  await prisma.pageView.deleteMany({
    where: { path: { in: ["/e2e-test-path", "/admin/siparisler"] } },
  });
  await prisma.errorLog.deleteMany({
    where: { message: { contains: "E2E test" } },
  });

  // Clean any lingering test accounts so the run is idempotent.
  const emails = [
    "e2e-customer@test.local",
    "e2e-dealer@test.local",
    "e2e-rl@test.local",
    "e2e-role-target@test.local",
  ];
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) continue;
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.address.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.dealerDiscount.deleteMany({
      where: { dealer: { userId: user.id } },
    });
    await prisma.dealer.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  // Clean FAZ 1 products / taxonomies created by the scenario runner.
  await prisma.product.deleteMany({
    where: { sku: { startsWith: "E2E-SKU-" } },
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: "e2e-kategori-" } },
  });
  await prisma.publisher.deleteMany({
    where: { slug: { startsWith: "e2e-yayinevi-" } },
  });
}

// ---- Scenarios ---------------------------------------------------------

async function scenarioServerUp() {
  section("Server up");
  const res = await fetch(`${BASE}/`);
  log("storefront GET /", res.ok || res.status < 500, `status=${res.status}`);
}

async function scenarioRobotsAndSitemap() {
  section("SEO: robots.txt & sitemap.xml");
  const robots = await fetch(`${BASE}/robots.txt`);
  log("robots.txt served", robots.ok, `status=${robots.status}`);
  const robotsText = await robots.text();
  log("robots disallows /admin", robotsText.toLowerCase().includes("/admin"));

  const sitemap = await fetch(`${BASE}/sitemap.xml`);
  log("sitemap.xml served", sitemap.ok, `status=${sitemap.status}`);
  const sitemapText = await sitemap.text();
  log(
    "sitemap contains /urunler entry",
    sitemapText.includes("/urunler")
  );
}

async function scenarioSecurityHeaders() {
  section("Security headers");
  const res = await fetch(`${BASE}/`);
  const csp = res.headers.get("content-security-policy");
  const xfo = res.headers.get("x-frame-options");
  const xcto = res.headers.get("x-content-type-options");
  log("CSP present", !!csp);
  log("X-Frame-Options DENY", xfo === "DENY");
  log("X-Content-Type-Options nosniff", xcto === "nosniff");
}

async function scenarioCustomerRegisterAndOrder() {
  section("Customer: register → login → checkout");
  const jar: CookieJar = new Map();
  const email = "e2e-customer@test.local";
  const password = "secret123";

  const reg = await http("POST", "/api/auth/register", {
    body: { name: "E2E Customer", email, password, phone: "05551112233" },
  });
  log("register 201", reg.status === 201, `status=${reg.status}`);

  const regDup = await http("POST", "/api/auth/register", {
    body: { name: "Dup", email, password, phone: "" },
  });
  // Faz 16: register email enumeration koruması — duplicate email artık generic
  // 201 döner (response farkından enumeration yapılmasın diye).
  log(
    "duplicate register generic 201 (no enumeration)",
    regDup.status === 201,
    `status=${regDup.status}`
  );

  const loginRes = await login(jar, email, password);
  log("login has session", loginRes.hasSession);

  // Pick a product with stock to buy
  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 }, price: { gt: 0 } },
  });
  if (!product) {
    log("seed has a buyable product", false, "no product available");
    return;
  }

  const initialStock = product.stockQuantity;

  const orderRes = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Customer",
        email,
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34000",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4242",
        expiry: "12/35",
        cvv: "123",
        holderName: "E2E CUSTOMER",
      },
      note: "Test siparis",
    },
  });
  const orderData = (await orderRes.json()) as {
    success?: boolean;
    orderNumber?: string;
    paymentUrl?: string;
    error?: string;
  };
  log(
    "customer order created",
    orderRes.status === 200 && orderData.success === true,
    orderData.error
  );

  // Confirm the payment so stock assertion matches the final state.
  if (orderData.paymentUrl) {
    const token = orderData.paymentUrl.split("/").pop()!;
    await http("POST", "/api/payments/mock/confirm", {
      body: { token, action: "success", otp: "123456" },
    });
  }

  if (orderData.success) {
    const refreshed = await prisma.product.findUnique({
      where: { id: product.id },
      select: { stockQuantity: true },
    });
    log(
      "stock decremented by order",
      refreshed?.stockQuantity === initialStock - 1,
      `was ${initialStock}, now ${refreshed?.stockQuantity}`
    );
  }

  // Place a second order with same address → should dedupe
  const beforeCount = await prisma.address.count({
    where: { user: { email } },
  });
  const orderRes2 = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Customer",
        email,
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34000",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4242",
        expiry: "12/35",
        cvv: "123",
        holderName: "E2E CUSTOMER",
      },
    },
  });
  if (orderRes2.ok) {
    const afterCount = await prisma.address.count({
      where: { user: { email } },
    });
    log(
      "address dedup on repeat order",
      afterCount === beforeCount,
      `before=${beforeCount}, after=${afterCount}`
    );
  }
}

async function scenarioInvalidOrder() {
  section("Invalid orders");
  // empty items
  const empty = await http("POST", "/api/orders", {
    body: {
      items: [],
      shipping: {
        fullName: "x",
        email: "y@z.com",
        phone: "05551112233",
        city: "İstanbul",
        address: "aa",
        district: "",
        postalCode: "",
      },
      paymentMethod: "CREDIT_CARD",
    },
  });
  log("empty cart rejected 400", empty.status === 400);

  // OPEN_ACCOUNT without dealer session — need a valid product id so we get past validation
  const realProduct = await prisma.product.findFirst({
    where: { isPublished: true, price: { gt: 0 } },
    select: { id: true },
  });
  const jar: CookieJar = new Map();
  const open = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: realProduct?.id ?? "unknown", quantity: 1 }],
      shipping: {
        fullName: "Misafir Kullanici",
        email: "misafir@test.local",
        phone: "05551112233",
        city: "İstanbul",
        address: "Gecici Mah. Gecici Sok. No:1",
        district: "Kadıköy",
        postalCode: "",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
  });
  log(
    "OPEN_ACCOUNT as non-dealer rejected 403",
    open.status === 403,
    `status=${open.status}`
  );
}

async function scenarioDealerFlow() {
  section("Dealer: apply → admin approve → discount → OPEN_ACCOUNT order → cancel");
  const dealerEmail = "e2e-dealer@test.local";
  const dealerPassword = "dealer123";

  const apply = await http("POST", "/api/dealer/apply", {
    body: {
      name: "E2E Dealer Owner",
      email: dealerEmail,
      phone: "05550000000",
      password: dealerPassword,
      companyName: "E2E Bayi A.S.",
      taxOffice: "Kadıköy",
      taxNumber: "1234567890",
      tradeRegNo: "",
      contactPerson: "",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Bayi mah. test cad. 12",
    },
  });
  log(
    "dealer apply 201",
    apply.status === 201,
    `status=${apply.status}`
  );

  // Login as admin
  const adminJar: CookieJar = new Map();
  const adminLogin = await login(
    adminJar,
    "admin@mastereducation.com.tr",
    "admin123"
  );
  log("admin login", adminLogin.hasSession);

  const dealer = await prisma.dealer.findFirst({
    where: { user: { email: dealerEmail } },
    select: { id: true, status: true },
  });
  if (!dealer) {
    log("dealer persisted in DB", false);
    return;
  }
  log("dealer status PENDING after apply", dealer.status === "PENDING");

  const approveRes = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/approve`,
    {
      jar: adminJar,
      body: { creditLimit: 5000 },
    }
  );
  log("admin approve 200", approveRes.ok, `status=${approveRes.status}`);

  // Non-admin trying to approve → forbidden
  const stranger = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/approve`,
    { body: { creditLimit: 99999 } }
  );
  log(
    "non-admin cannot approve (401)",
    stranger.status === 401,
    `status=${stranger.status}`
  );

  // Create PUBLISHER-level discount for this dealer, pick a publisher that has products
  const product = await prisma.product.findFirst({
    where: {
      isPublished: true,
      stockQuantity: { gt: 0 },
      price: { gt: 0 },
      publisherId: { not: null },
    },
  });
  if (!product?.publisherId) {
    log("product with publisher found", false);
    return;
  }
  const discountRes = await http("POST", "/api/admin/discounts", {
    jar: adminJar,
    body: {
      dealerId: dealer.id,
      scope: "PUBLISHER",
      discountPct: 20,
      publisherId: product.publisherId,
    },
  });
  log(
    "discount created",
    discountRes.ok,
    `status=${discountRes.status}`
  );

  // Dealer login → place OPEN_ACCOUNT order
  const dealerJar: CookieJar = new Map();
  const dealerLogin = await login(dealerJar, dealerEmail, dealerPassword);
  log("dealer login", dealerLogin.hasSession);

  // Fetch product via API and confirm dealerPrice present
  const productRes = await http("GET", `/api/products/${product.slug}`, {
    jar: dealerJar,
  });
  const productData = (await productRes.json()) as {
    dealerPrice?: number | null;
    dealerDiscountPct?: number | null;
    price: number;
  };
  log(
    "dealer sees dealerPrice",
    typeof productData.dealerPrice === "number" &&
      productData.dealerDiscountPct === 20,
    `dealerPrice=${productData.dealerPrice} pct=${productData.dealerDiscountPct}`
  );

  const stockBefore = product.stockQuantity;
  const orderRes = await http("POST", "/api/orders", {
    jar: dealerJar,
    body: {
      items: [{ productId: product.id, quantity: 2 }],
      shipping: {
        fullName: "E2E Bayi A.S.",
        email: dealerEmail,
        phone: "05550000000",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Bayi mah. test cad. 12",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
  });
  const orderJson = (await orderRes.json()) as {
    success?: boolean;
    orderId?: string;
    error?: string;
  };
  log(
    "dealer OPEN_ACCOUNT order created",
    orderRes.status === 200 && orderJson.success === true,
    orderJson.error
  );

  if (!orderJson.orderId) return;

  const dealerAfter = await prisma.dealer.findUnique({
    where: { id: dealer.id },
    select: { currentBalance: true },
  });
  log(
    "dealer balance incremented",
    Number(dealerAfter?.currentBalance ?? 0) > 0,
    `balance=${dealerAfter?.currentBalance}`
  );

  const productMid = await prisma.product.findUnique({
    where: { id: product.id },
    select: { stockQuantity: true },
  });
  log(
    "stock decremented by dealer order",
    (productMid?.stockQuantity ?? 0) === stockBefore - 2,
    `was ${stockBefore}, now ${productMid?.stockQuantity}`
  );

  // Cancel the order as admin → stock should restore, balance should revert
  const cancelRes = await http(
    "POST",
    `/api/admin/orders/${orderJson.orderId}/status`,
    {
      jar: adminJar,
      body: { status: "CANCELLED" },
    }
  );
  log("admin cancel 200", cancelRes.ok, `status=${cancelRes.status}`);

  const productAfter = await prisma.product.findUnique({
    where: { id: product.id },
    select: { stockQuantity: true },
  });
  log(
    "stock restored on cancel",
    (productAfter?.stockQuantity ?? 0) === stockBefore,
    `expected ${stockBefore}, got ${productAfter?.stockQuantity}`
  );

  const dealerFinal = await prisma.dealer.findUnique({
    where: { id: dealer.id },
    select: { currentBalance: true },
  });
  log(
    "dealer balance rolled back on cancel",
    Number(dealerFinal?.currentBalance ?? 1) === 0,
    `balance=${dealerFinal?.currentBalance}`
  );

  // Reopen a cancelled order — should be rejected
  const reopen = await http(
    "POST",
    `/api/admin/orders/${orderJson.orderId}/status`,
    { jar: adminJar, body: { status: "APPROVED" } }
  );
  log(
    "cannot reopen cancelled order (400)",
    reopen.status === 400,
    `status=${reopen.status}`
  );

  // Credit limit block — try to place an order above the credit limit
  const expensiveQuantity = 9999;
  const overLimit = await http("POST", "/api/orders", {
    jar: dealerJar,
    body: {
      items: [{ productId: product.id, quantity: expensiveQuantity }],
      shipping: {
        fullName: "E2E Bayi A.S.",
        email: dealerEmail,
        phone: "05550000000",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Bayi mah. test cad. 12",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
  });
  log(
    "credit limit enforced",
    overLimit.status === 400,
    `status=${overLimit.status}`
  );

  // Suspend dealer → JWT fresh fetch should block OPEN_ACCOUNT
  const suspend = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/suspend`,
    { jar: adminJar, body: { notes: "test" } }
  );
  log("admin suspend 200", suspend.ok, `status=${suspend.status}`);

  const afterSuspend = await http("POST", "/api/orders", {
    jar: dealerJar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Bayi A.S.",
        email: dealerEmail,
        phone: "05550000000",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Bayi mah. test cad. 12",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
  });
  log(
    "suspended dealer cannot OPEN_ACCOUNT",
    afterSuspend.status === 403,
    `status=${afterSuspend.status}`
  );
}

async function scenarioRateLimit() {
  section("Rate limit: register brute force");
  // 10 is the cap (per IP)
  let gotLimited = false;
  for (let i = 0; i < 15; i++) {
    const res = await http("POST", "/api/auth/register", {
      body: {
        name: "rl",
        email: `e2e-rl-${i}@test.local`,
        password: "abc123",
        phone: "",
      },
    });
    if (res.status === 429) {
      gotLimited = true;
      break;
    }
  }
  log("register hits 429 after cap", gotLimited);
}

async function scenarioCartRefresh() {
  section("Cart refresh API");
  const product = await prisma.product.findFirst({
    where: { isPublished: true, price: { gt: 0 } },
  });
  if (!product) return;
  const res = await http("POST", "/api/cart/refresh", {
    body: {
      items: [{ productId: product.id, quantity: 1 }],
    },
  });
  const data = (await res.json()) as {
    items: Array<{ productId: string; price: number; isPublished: boolean }>;
  };
  log(
    "cart refresh returns product",
    data.items.length === 1 && data.items[0].productId === product.id
  );
  log("cart refresh includes price", typeof data.items[0]?.price === "number");
}

async function scenarioPasswordResetInvalidation() {
  section("Password reset: old tokens invalidated");
  // Ensure test user exists (reuse customer e2e-customer@test.local if there)
  const user = await prisma.user.findUnique({
    where: { email: "e2e-customer@test.local" },
  });
  if (!user) {
    log("prerequisite user present", false, "run customer scenario first");
    return;
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  await http("POST", "/api/auth/forgot-password", {
    body: { email: user.email },
  });
  await http("POST", "/api/auth/forgot-password", {
    body: { email: user.email },
  });

  const tokens = await prisma.passwordResetToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  log("two tokens created", tokens.length === 2);
  log(
    "first token marked used after second request",
    !!tokens[0]?.usedAt && !tokens[1]?.usedAt
  );
}

async function scenarioAuditLog() {
  section("Audit log");
  const count = await prisma.auditLog.count({
    where: {
      action: { in: ["DEALER_APPROVE", "DEALER_SUSPEND", "ORDER_STATUS_CHANGE"] },
    },
  });
  log("audit rows written by prior scenarios", count > 0, `count=${count}`);
}

// ---- FAZ 1 Scenarios ---------------------------------------------------

async function scenarioAdminProductCrud() {
  section("Admin: product CRUD");
  const adminJar: CookieJar = new Map();
  const adminLogin = await login(
    adminJar,
    "admin@mastereducation.com.tr",
    "admin123"
  );
  log("admin login", adminLogin.hasSession);

  const publisher = await prisma.publisher.findFirst();
  const category = await prisma.category.findFirst();
  if (!publisher || !category) {
    log("have at least one publisher/category", false);
    return;
  }

  const timestamp = Date.now();
  const sku = `E2E-SKU-${timestamp}`;

  // Create
  const createRes = await http("POST", "/api/admin/products", {
    jar: adminJar,
    body: {
      name: `E2E Test Kitabi ${timestamp}`,
      sku,
      price: 99.9,
      vatRate: 0,
      stockQuantity: 10,
      publisherId: publisher.id,
      categoryId: category.id,
      language: "Turkce",
      isPublished: true,
    },
  });
  const created = (await createRes.json()) as { id?: string; error?: string };
  log(
    "product create 200",
    createRes.ok && typeof created.id === "string",
    created.error ?? `status=${createRes.status}`
  );
  if (!created.id) return;

  // Unauthorized create should fail
  const anonCreate = await http("POST", "/api/admin/products", {
    body: { name: "nope", sku: "nope", price: 1 },
  });
  log(
    "non-admin cannot create product (401)",
    anonCreate.status === 401,
    `status=${anonCreate.status}`
  );

  // Create with empty name should fail validation
  const badCreate = await http("POST", "/api/admin/products", {
    jar: adminJar,
    body: { name: "", sku: "X", price: 1 },
  });
  log(
    "invalid payload rejected 400",
    badCreate.status === 400,
    `status=${badCreate.status}`
  );

  // Update
  const updateRes = await http("PATCH", `/api/admin/products/${created.id}`, {
    jar: adminJar,
    body: {
      price: 149.9,
      stockQuantity: 25,
      isPublished: false,
    },
  });
  log("product update 200", updateRes.ok, `status=${updateRes.status}`);

  const afterUpdate = await prisma.product.findUnique({
    where: { id: created.id },
    select: { price: true, stockQuantity: true, isPublished: true },
  });
  log(
    "update persisted",
    Number(afterUpdate?.price) === 149.9 &&
      afterUpdate?.stockQuantity === 25 &&
      afterUpdate?.isPublished === false
  );

  // Delete (hard — no order items reference it)
  const deleteRes = await http(
    "DELETE",
    `/api/admin/products/${created.id}`,
    { jar: adminJar }
  );
  const deleteJson = (await deleteRes.json()) as {
    ok?: boolean;
    mode?: "soft" | "hard";
  };
  log(
    "product delete 200 mode=hard",
    deleteRes.ok && deleteJson.mode === "hard",
    `status=${deleteRes.status} mode=${deleteJson.mode}`
  );

  const stillThere = await prisma.product.findUnique({
    where: { id: created.id },
  });
  log("product row removed from DB", stillThere === null);
}

async function scenarioSoftDeleteOnOrderedProduct() {
  section("Admin: soft delete when product has order history");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  const orderedProduct = await prisma.product.findFirst({
    where: {
      orderItems: { some: {} },
      isPublished: true,
    },
    select: { id: true, isPublished: true, stockQuantity: true },
  });
  if (!orderedProduct) {
    log("a product with order history exists", false, "skipping scenario");
    return;
  }

  const priorPublished = orderedProduct.isPublished;
  const priorStock = orderedProduct.stockQuantity;

  const res = await http(
    "DELETE",
    `/api/admin/products/${orderedProduct.id}`,
    { jar: adminJar }
  );
  const data = (await res.json()) as { mode?: "soft" | "hard" };
  log(
    "delete on ordered product falls back to soft delete",
    res.ok && data.mode === "soft",
    `mode=${data.mode}`
  );

  const after = await prisma.product.findUnique({
    where: { id: orderedProduct.id },
    select: { isPublished: true, stockQuantity: true },
  });
  log(
    "soft-deleted product is unpublished with zero stock",
    after?.isPublished === false && after?.stockQuantity === 0
  );

  // Restore so re-runs stay idempotent.
  await prisma.product.update({
    where: { id: orderedProduct.id },
    data: { isPublished: priorPublished, stockQuantity: priorStock },
  });
}

async function scenarioTaxonomyCrud() {
  section("Admin: category & publisher CRUD");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  // Category
  const catRes = await http("POST", "/api/admin/categories", {
    jar: adminJar,
    body: { name: "e2e kategori test", type: "ana" },
  });
  const catData = (await catRes.json()) as { id?: string; slug?: string };
  log(
    "category create",
    catRes.ok && !!catData.id,
    `slug=${catData.slug}`
  );

  // Update
  if (catData.id) {
    const updRes = await http(
      "PATCH",
      `/api/admin/categories/${catData.id}`,
      {
        jar: adminJar,
        body: { name: "E2E kategori yeniden", type: "detay" },
      }
    );
    log("category update", updRes.ok, `status=${updRes.status}`);

    // Create a product under this category, then deletion should fail
    const pub = await prisma.publisher.findFirst();
    const stamp = Math.floor(Date.now() / 1000);
    const maxNop = await prisma.product.aggregate({ _max: { nopId: true } });
    const prod = await prisma.product.create({
      data: {
        name: `E2E Kategorili Urun ${stamp}`,
        sku: `E2E-SKU-KAT-${stamp}`,
        slug: `e2e-kategorili-urun-${stamp}`,
        price: 10,
        nopId: (maxNop._max.nopId ?? 0) + 1,
        categoryId: catData.id,
        publisherId: pub?.id,
        isPublished: true,
      },
    });

    const delFail = await http(
      "DELETE",
      `/api/admin/categories/${catData.id}`,
      { jar: adminJar }
    );
    log(
      "category with products cannot be deleted (409)",
      delFail.status === 409,
      `status=${delFail.status}`
    );

    await prisma.product.delete({ where: { id: prod.id } });

    // Now delete should succeed
    const delOk = await http(
      "DELETE",
      `/api/admin/categories/${catData.id}`,
      { jar: adminJar }
    );
    log("empty category deleted", delOk.ok, `status=${delOk.status}`);
  }

  // Publisher
  const pubRes = await http("POST", "/api/admin/publishers", {
    jar: adminJar,
    body: { name: `E2E Yayinevi ${Date.now()}` },
  });
  const pubData = (await pubRes.json()) as { id?: string; slug?: string };
  log("publisher create", pubRes.ok && !!pubData.id, `slug=${pubData.slug}`);

  // Duplicate publisher should reject
  if (pubData.id) {
    // Ensure slug matches E2E pattern for cleanup
    if (!pubData.slug?.startsWith("e2e-yayinevi-")) {
      // adjust by PATCH so cleanup can find it later (best-effort)
    }
    const dupRes = await http("POST", "/api/admin/publishers", {
      jar: adminJar,
      body: { name: `E2E Yayinevi duplicate` },
    });
    if (dupRes.ok) {
      const again = await http("POST", "/api/admin/publishers", {
        jar: adminJar,
        body: { name: `E2E Yayinevi duplicate` },
      });
      log(
        "publisher duplicate name rejected (409)",
        again.status === 409,
        `status=${again.status}`
      );
      const againData = (await dupRes.json()) as { id?: string };
      if (againData.id) {
        await prisma.publisher.delete({ where: { id: againData.id } });
      }
    }

    const delRes = await http(
      "DELETE",
      `/api/admin/publishers/${pubData.id}`,
      { jar: adminJar }
    );
    log(
      "empty publisher deleted",
      delRes.ok,
      `status=${delRes.status}`
    );
  }
}

async function scenarioProductImageUpload() {
  section("Admin: product image upload");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  const product = await prisma.product.findFirst({
    where: { isPublished: true },
    select: { id: true },
  });
  if (!product) {
    log("have a product", false);
    return;
  }

  // 1x1 transparent PNG
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
  );

  const fd = new FormData();
  fd.append(
    "file",
    new Blob([pngBytes as BlobPart], { type: "image/png" }),
    "test.png"
  );

  const before = await prisma.productImage.count({
    where: { productId: product.id },
  });

  const res = await fetch(
    `${BASE}/api/admin/products/${product.id}/images`,
    {
      method: "POST",
      headers: { cookie: cookieHeader(adminJar) },
      body: fd,
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    filename?: string;
    error?: string;
  };
  log(
    "image upload 200",
    res.ok && !!data.id,
    data.error ?? `status=${res.status}`
  );

  const after = await prisma.productImage.count({
    where: { productId: product.id },
  });
  log("image row persisted", after === before + 1);

  // Upload invalid MIME
  const fdBad = new FormData();
  fdBad.append(
    "file",
    new Blob(["not an image" as BlobPart], { type: "text/plain" }),
    "test.txt"
  );
  const badRes = await fetch(
    `${BASE}/api/admin/products/${product.id}/images`,
    {
      method: "POST",
      headers: { cookie: cookieHeader(adminJar) },
      body: fdBad,
    }
  );
  log(
    "invalid mime rejected 400",
    badRes.status === 400,
    `status=${badRes.status}`
  );

  // Delete the image we just added
  if (data.id) {
    const delRes = await http(
      "DELETE",
      `/api/admin/products/${product.id}/images/${data.id}`,
      { jar: adminJar }
    );
    log("image delete 200", delRes.ok, `status=${delRes.status}`);
  }
}

// ---- FAZ 2 Scenarios ---------------------------------------------------

async function scenarioLedgerAndPayments() {
  section("FAZ 2: dealer ledger, payments, VAT");

  // Reuse the dealer from the earlier scenario? It got suspended. Re-approve it.
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  const dealer = await prisma.dealer.findFirst({
    where: { user: { email: "e2e-dealer@test.local" } },
  });
  if (!dealer) {
    log("have test dealer from earlier scenario", false);
    return;
  }

  // Re-approve so the dealer can place orders again
  await http("POST", `/api/admin/dealers/${dealer.id}/approve`, {
    jar: adminJar,
    body: { creditLimit: 10000 },
  });

  // Clear any previous ledger rows and reset balance so tests are deterministic
  await prisma.dealerLedger.deleteMany({ where: { dealerId: dealer.id } });
  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { currentBalance: 0 },
  });

  // Pick a product with known vatRate — set one explicitly so we can verify
  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 5 }, price: { gt: 0 } },
  });
  if (!product) {
    log("have a buyable product", false);
    return;
  }
  // Force VAT to 10% for deterministic arithmetic
  await prisma.product.update({
    where: { id: product.id },
    data: { vatRate: 10, price: 110 },
  });
  const priorStock = product.stockQuantity;

  // Dealer login and place order
  const dealerJar: CookieJar = new Map();
  await login(dealerJar, "e2e-dealer@test.local", "dealer123");

  const orderRes = await http("POST", "/api/orders", {
    jar: dealerJar,
    body: {
      items: [{ productId: product.id, quantity: 2 }],
      shipping: {
        fullName: "E2E Bayi A.S.",
        email: "e2e-dealer@test.local",
        phone: "05550000000",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Bayi mah. test cad. 12",
      },
      paymentMethod: "OPEN_ACCOUNT",
    },
  });
  const orderJson = (await orderRes.json()) as {
    orderId?: string;
    success?: boolean;
    error?: string;
  };
  log(
    "dealer places OPEN_ACCOUNT order",
    orderRes.ok && orderJson.success === true,
    orderJson.error
  );

  if (!orderJson.orderId) return;

  const created = await prisma.order.findUnique({
    where: { id: orderJson.orderId },
    include: { items: true },
  });
  // Dealer has a 20% PUBLISHER discount from earlier scenario.
  // price 110 → dealerPrice 88 → lineTotal 176 → VAT = 176 * 10 / 110 = 16
  log(
    "order.vatTotal computed (KDV inclusive)",
    Number(created?.vatTotal ?? 0) === 16,
    `vatTotal=${created?.vatTotal}`
  );
  log(
    "orderItem.vatAmount populated",
    Number(created?.items[0]?.vatAmount ?? 0) === 16,
    `vatAmount=${created?.items[0]?.vatAmount}`
  );

  const ledgerAfterOrder = await prisma.dealerLedger.findFirst({
    where: { dealerId: dealer.id, orderId: orderJson.orderId },
  });
  log(
    "ledger row created on OPEN_ACCOUNT order",
    !!ledgerAfterOrder && ledgerAfterOrder.kind === "ORDER_DEBIT"
  );
  log(
    "ledger balanceAfter matches order total",
    Number(ledgerAfterOrder?.balanceAfter ?? -1) ===
      Number(created?.total ?? 0),
    `balance=${ledgerAfterOrder?.balanceAfter} total=${created?.total}`
  );

  // Admin records a partial payment
  const paymentAmount = 100;
  const payRes = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/payments`,
    {
      jar: adminJar,
      body: { amount: paymentAmount, reference: "TEST-DEKONT-1", note: "Havale" },
    }
  );
  const payJson = (await payRes.json()) as {
    balanceAfter?: number;
    error?: string;
  };
  log(
    "payment endpoint 200",
    payRes.ok,
    payJson.error ?? `status=${payRes.status}`
  );
  log(
    "payment decreases balance",
    payJson.balanceAfter === Number(created?.total ?? 0) - paymentAmount,
    `balanceAfter=${payJson.balanceAfter}`
  );

  // Invalid: negative-amount payment rejected
  const negPay = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/payments`,
    { jar: adminJar, body: { amount: -50 } }
  );
  log(
    "negative payment rejected (400)",
    negPay.status === 400,
    `status=${negPay.status}`
  );

  // Admin makes a manual adjustment (add a fee)
  const adjRes = await http(
    "POST",
    `/api/admin/dealers/${dealer.id}/adjustments`,
    {
      jar: adminJar,
      body: { amount: 15, note: "Geciken odeme faizi" },
    }
  );
  log("manual adjustment 200", adjRes.ok, `status=${adjRes.status}`);

  // Sum amounts from ledger and compare with dealer.currentBalance
  const entries = await prisma.dealerLedger.findMany({
    where: { dealerId: dealer.id },
    orderBy: { createdAt: "asc" },
  });
  const sum = entries.reduce((s, e) => s + Number(e.amount), 0);
  const dealerNow = await prisma.dealer.findUnique({
    where: { id: dealer.id },
    select: { currentBalance: true },
  });
  log(
    "ledger entries sum equals dealer.currentBalance",
    Math.abs(sum - Number(dealerNow?.currentBalance ?? 0)) < 0.01,
    `sum=${sum} balance=${dealerNow?.currentBalance}`
  );

  // Cancel the order → ledger credit, balance rolls back
  const cancelRes = await http(
    "POST",
    `/api/admin/orders/${orderJson.orderId}/status`,
    { jar: adminJar, body: { status: "CANCELLED" } }
  );
  log("order cancelled", cancelRes.ok, `status=${cancelRes.status}`);

  const afterCancelEntries = await prisma.dealerLedger.findMany({
    where: { dealerId: dealer.id },
  });
  log(
    "cancel writes ledger ORDER_CANCEL_CREDIT",
    afterCancelEntries.some((e) => e.kind === "ORDER_CANCEL_CREDIT")
  );

  // Cart refresh should see stock restored
  const productAfter = await prisma.product.findUnique({
    where: { id: product.id },
    select: { stockQuantity: true },
  });
  log(
    "stock restored after cancel",
    productAfter?.stockQuantity === priorStock,
    `was=${priorStock} now=${productAfter?.stockQuantity}`
  );

  // Bayi cari ekstre sayfası
  const statementRes = await http("GET", "/bayi/ekstre", { jar: dealerJar });
  log(
    "dealer statement page loads",
    statementRes.ok,
    `status=${statementRes.status}`
  );

  // Fatura sayfası
  const invoiceRes = await http(
    "GET",
    `/admin/siparisler/${orderJson.orderId}/fatura`,
    { jar: adminJar }
  );
  log("admin invoice page loads", invoiceRes.ok, `status=${invoiceRes.status}`);
  const invoiceHtml = await invoiceRes.text();
  log("invoice shows VAT breakdown", invoiceHtml.includes("KDV"));

  // Irsaliye
  const dnRes = await http(
    "GET",
    `/admin/siparisler/${orderJson.orderId}/irsaliye`,
    { jar: adminJar }
  );
  log("admin delivery note page loads", dnRes.ok, `status=${dnRes.status}`);

  // CSV export — header should include KDV
  const csvRes = await http(
    "GET",
    "/api/admin/accounting/export?type=orders",
    { jar: adminJar }
  );
  const csvText = await csvRes.text();
  log(
    "CSV export includes KDV column",
    csvText.includes("KDV") && csvText.includes("Net (KDV Haric)")
  );
}

// ---- FAZ 3 Scenarios ---------------------------------------------------

async function scenarioCustomerPaymentSuccess() {
  section("FAZ 3: customer 3D Secure success");
  const jar: CookieJar = new Map();
  const email = "e2e-customer@test.local";
  const password = "secret123";
  await login(jar, email, password);

  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 }, price: { gt: 0 } },
  });
  if (!product) {
    log("buyable product exists", false);
    return;
  }
  const priorStock = product.stockQuantity;

  const res = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Customer",
        email,
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34000",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4242",
        expiry: "12/35",
        cvv: "123",
        holderName: "E2E CUSTOMER",
      },
    },
  });
  const data = (await res.json()) as {
    success?: boolean;
    orderId?: string;
    requiresPayment?: boolean;
    paymentUrl?: string;
    error?: string;
  };
  log(
    "credit card order creates payment session",
    res.ok && data.requiresPayment === true && !!data.paymentUrl,
    data.error ?? `status=${res.status}`
  );

  if (!data.paymentUrl) return;
  const token = data.paymentUrl.split("/").pop()!;

  const midStock = await prisma.product.findUnique({
    where: { id: product.id },
    select: { stockQuantity: true },
  });
  log(
    "stock reserved while payment pending",
    (midStock?.stockQuantity ?? 0) === priorStock - 1,
    `was=${priorStock} now=${midStock?.stockQuantity}`
  );

  const badOtp = await http("POST", "/api/payments/mock/confirm", {
    body: { token, action: "success", otp: "000000" },
  });
  log("wrong OTP rejected 400", badOtp.status === 400);

  const confirm = await http("POST", "/api/payments/mock/confirm", {
    body: { token, action: "success", otp: "123456" },
  });
  log(
    "correct OTP confirms payment",
    confirm.ok,
    `status=${confirm.status}`
  );

  const ps = await prisma.paymentSession.findUnique({ where: { token } });
  log("payment session COMPLETED", ps?.status === "COMPLETED");

  const orderAfter = await prisma.order.findUnique({
    where: { id: data.orderId! },
    select: { paymentStatus: true, status: true },
  });
  log(
    "order paymentStatus = PAID",
    orderAfter?.paymentStatus === "PAID",
    `paymentStatus=${orderAfter?.paymentStatus}`
  );

  const replay = await http("POST", "/api/payments/mock/confirm", {
    body: { token, action: "success", otp: "123456" },
  });
  log("replayed confirm rejected 409", replay.status === 409);
}

async function scenarioCustomerPaymentFailure() {
  section("FAZ 3: customer 3D Secure failure restores stock");
  const jar: CookieJar = new Map();
  await login(jar, "e2e-customer@test.local", "secret123");

  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 }, price: { gt: 0 } },
  });
  if (!product) return;
  const priorStock = product.stockQuantity;

  const res = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Customer",
        email: "e2e-customer@test.local",
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4242",
        expiry: "12/35",
        cvv: "123",
        holderName: "E2E CUSTOMER",
      },
    },
  });
  const data = (await res.json()) as {
    orderId?: string;
    paymentUrl?: string;
  };
  if (!data.paymentUrl) {
    log("order created", false);
    return;
  }
  const token = data.paymentUrl.split("/").pop()!;

  const fail = await http("POST", "/api/payments/mock/confirm", {
    body: { token, action: "failure" },
  });
  log("failure action 200", fail.ok, `status=${fail.status}`);

  const stockNow = await prisma.product.findUnique({
    where: { id: product.id },
    select: { stockQuantity: true },
  });
  log(
    "stock restored after failure",
    stockNow?.stockQuantity === priorStock,
    `was=${priorStock} now=${stockNow?.stockQuantity}`
  );

  const orderAfter = await prisma.order.findUnique({
    where: { id: data.orderId! },
    select: { status: true, paymentStatus: true },
  });
  log(
    "order status CANCELLED after failure",
    orderAfter?.status === "CANCELLED",
    `status=${orderAfter?.status}`
  );
}

async function scenarioInvalidCard() {
  section("FAZ 3: invalid card rejected at /api/orders");
  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 }, price: { gt: 0 } },
  });
  if (!product) return;

  const res = await http("POST", "/api/orders", {
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Guest",
        email: "guest-invalid@test.local",
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4241",
        expiry: "12/35",
        cvv: "123",
        holderName: "GUEST",
      },
    },
  });
  log("invalid Luhn → 400", res.status === 400, `status=${res.status}`);
}

async function scenarioAutoTrackingAndPage() {
  section("FAZ 3: auto tracking on SHIPPED + public tracking page");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  const order = await prisma.order.findFirst({
    where: {
      user: { email: "e2e-customer@test.local" },
      status: { notIn: ["SHIPPED", "CANCELLED", "DELIVERED"] },
      trackingNumber: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    log("have an open customer order", false, "skipping");
    return;
  }

  const ship = await http(
    "POST",
    `/api/admin/orders/${order.id}/status`,
    { jar: adminJar, body: { status: "SHIPPED" } }
  );
  log("ship transition 200", ship.ok, `status=${ship.status}`);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: { trackingNumber: true, trackingCarrier: true, shippedAt: true },
  });
  log(
    "tracking number auto-generated",
    !!after?.trackingNumber && after.trackingNumber.startsWith("MOCK-")
  );
  log("carrier set", after?.trackingCarrier === "OTHER");
  log("shippedAt populated", !!after?.shippedAt);

  if (after?.trackingNumber) {
    const trackRes = await http("GET", `/kargo-takip/${after.trackingNumber}`);
    log("tracking page serves 200", trackRes.ok, `status=${trackRes.status}`);
    const html = await trackRes.text();
    log("tracking page shows order number", html.includes(order.orderNumber));
  }

  // Next.js 16 streaming: notFound() await sonrası çağrılırsa stream başladığı
  // için status 404'e çevrilemez. Bunun yerine `<meta robots="noindex">` enjekte
  // edilir → Google index etmez. SEO açısından doğru davranış.
  const trackMissing = await http("GET", "/kargo-takip/MOCK-NOT-FOUND-123");
  const trackMissingHtml = await trackMissing.text();
  const trackNoindex =
    trackMissing.status === 404 ||
    /name="robots"\s+content="noindex"/.test(trackMissingHtml);
  log(
    "unknown tracking number → 404 or noindex",
    trackNoindex,
    `status=${trackMissing.status}`
  );
}

// ---- FAZ 4 Scenarios ---------------------------------------------------

async function scenarioDealerDiscountsView() {
  section("FAZ 4: dealer can view own discounts");
  const dealerJar: CookieJar = new Map();
  const login1 = await login(
    dealerJar,
    "e2e-dealer@test.local",
    "dealer123"
  );
  if (!login1.hasSession) {
    log("dealer login", false);
    return;
  }
  const res = await http("GET", "/bayi/iskontolar", { jar: dealerJar });
  log(
    "dealer discounts page loads",
    res.ok,
    `status=${res.status}`
  );
  const html = await res.text();
  log("page mentions priority order", html.includes("oncelig"));
}

async function scenarioDealerDocuments() {
  section("FAZ 4: dealer documents upload/delete");
  const dealerJar: CookieJar = new Map();
  await login(dealerJar, "e2e-dealer@test.local", "dealer123");

  const pdfBytes = Buffer.from("%PDF-1.4\n%EOF\n", "utf-8");
  const fd = new FormData();
  fd.append("kind", "TAX_CERTIFICATE");
  fd.append(
    "file",
    new Blob([pdfBytes as BlobPart], { type: "application/pdf" }),
    "vergi-levhasi.pdf"
  );
  const res = await fetch(`${BASE}/api/dealer/documents`, {
    method: "POST",
    headers: { cookie: cookieHeader(dealerJar) },
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  log(
    "dealer uploads document",
    res.ok && !!data.id,
    data.error ?? `status=${res.status}`
  );

  const fdBad = new FormData();
  fdBad.append("kind", "TAX_CERTIFICATE");
  fdBad.append(
    "file",
    new Blob(["txt" as BlobPart], { type: "text/plain" }),
    "fake.txt"
  );
  const bad = await fetch(`${BASE}/api/dealer/documents`, {
    method: "POST",
    headers: { cookie: cookieHeader(dealerJar) },
    body: fdBad,
  });
  log(
    "unsupported MIME rejected (400)",
    bad.status === 400,
    `status=${bad.status}`
  );

  if (data.id) {
    const strangerJar: CookieJar = new Map();
    await login(strangerJar, "admin@mastereducation.com.tr", "admin123");
    const strange = await http(
      "DELETE",
      `/api/dealer/documents/${data.id}`,
      { jar: strangerJar }
    );
    log(
      "non-dealer cannot delete via dealer endpoint (401)",
      strange.status === 401,
      `status=${strange.status}`
    );

    const del = await http("DELETE", `/api/dealer/documents/${data.id}`, {
      jar: dealerJar,
    });
    log("dealer deletes own document", del.ok, `status=${del.status}`);
  }
}

async function scenarioBulkOrder() {
  section("FAZ 4: dealer bulk order via Excel");
  const dealerJar: CookieJar = new Map();
  await login(dealerJar, "e2e-dealer@test.local", "dealer123");

  const tpl = await http("GET", "/api/dealer/bulk-order/template", {
    jar: dealerJar,
  });
  log(
    "template download 200",
    tpl.ok &&
      !!tpl.headers.get("content-type")?.includes("spreadsheetml"),
    `status=${tpl.status}`
  );

  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.default.Workbook();
  const sheet = wb.addWorksheet("Siparis");
  sheet.columns = [
    { header: "sku", key: "sku", width: 20 },
    { header: "quantity", key: "quantity", width: 12 },
  ];
  const p1 = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gte: 2 } },
  });
  if (!p1) {
    log("have buyable product", false);
    return;
  }
  sheet.addRow({ sku: p1.sku, quantity: 2 });
  sheet.addRow({ sku: "NOT-A-REAL-SKU", quantity: 1 });
  const xlsxBuf = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);

  const fd = new FormData();
  fd.append(
    "file",
    new Blob([xlsxBuf as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    "bulk.xlsx"
  );
  const parseRes = await fetch(`${BASE}/api/dealer/bulk-order/parse`, {
    method: "POST",
    headers: { cookie: cookieHeader(dealerJar) },
    body: fd,
  });
  const parseData = (await parseRes.json().catch(() => ({}))) as {
    lines?: Array<{ ok: boolean; productId?: string | null; quantity: number }>;
    summary?: { okRows: number; failedRows: number };
    error?: string;
  };
  log(
    "bulk parse 200",
    parseRes.ok,
    parseData.error ?? `status=${parseRes.status}`
  );
  log(
    "parse distinguishes ok vs invalid rows",
    parseData.summary?.okRows === 1 && parseData.summary?.failedRows === 1
  );

  const okItems = (parseData.lines ?? [])
    .filter((l) => l.ok && l.productId)
    .map((l) => ({ productId: l.productId!, quantity: l.quantity }));

  const submitRes = await http("POST", "/api/dealer/bulk-order/submit", {
    jar: dealerJar,
    body: {
      items: okItems,
      shipping: {
        fullName: "E2E Bayi A.S.",
        email: "e2e-dealer@test.local",
        phone: "05550000000",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "",
        address: "Bayi mah. test cad. 12",
      },
      note: "Toplu siparis test",
    },
  });
  const submitData = (await submitRes.json()) as {
    orderId?: string;
    error?: string;
  };
  log(
    "bulk submit 200",
    submitRes.ok && !!submitData.orderId,
    submitData.error ?? `status=${submitRes.status}`
  );

  if (submitData.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: submitData.orderId },
      select: { paymentMethod: true, status: true },
    });
    log(
      "bulk order persisted with OPEN_ACCOUNT",
      order?.paymentMethod === "OPEN_ACCOUNT",
      `paymentMethod=${order?.paymentMethod}`
    );
  }
}

async function scenarioAddressManagement() {
  section("FAZ 4: customer address management");
  const jar: CookieJar = new Map();
  await login(jar, "e2e-customer@test.local", "secret123");

  // Create
  const createRes = await http("POST", "/api/account/addresses", {
    jar,
    body: {
      label: "Ev",
      fullName: "E2E Customer",
      phone: "05551112233",
      city: "İstanbul",
      district: "Kadıköy",
      postalCode: "34000",
      addressLine: "Yeni adres satiri",
      isDefault: true,
    },
  });
  const created = (await createRes.json()) as { id?: string; error?: string };
  log(
    "create address 200",
    createRes.ok && !!created.id,
    created.error ?? `status=${createRes.status}`
  );

  // List
  const list = await http("GET", "/api/account/addresses", { jar });
  const listData = (await list.json()) as {
    addresses: { id: string; isDefault: boolean }[];
  };
  log(
    "address list returns new default",
    listData.addresses.some((a) => a.id === created.id && a.isDefault)
  );

  // Adding another default flips the old one off
  const second = await http("POST", "/api/account/addresses", {
    jar,
    body: {
      label: "Is",
      fullName: "E2E Customer",
      phone: "05551112233",
      city: "İstanbul",
      district: "Beşiktaş",
      addressLine: "Ikinci adres",
      isDefault: true,
    },
  });
  const secondData = (await second.json()) as { id?: string };
  log("second address 200", second.ok && !!secondData.id);

  const afterList = await http("GET", "/api/account/addresses", { jar });
  const afterListData = (await afterList.json()) as {
    addresses: { id: string; isDefault: boolean }[];
  };
  const defaults = afterListData.addresses.filter((a) => a.isDefault);
  log("only one default address", defaults.length === 1);
  log("new address is default", defaults[0]?.id === secondData.id);

  const stranger = await http("GET", "/api/account/addresses");
  log(
    "unauthenticated list 401",
    stranger.status === 401,
    `status=${stranger.status}`
  );

  if (created.id) {
    const del = await http("DELETE", `/api/account/addresses/${created.id}`, {
      jar,
    });
    log("delete unused address", del.ok, `status=${del.status}`);
  }
  if (secondData.id) {
    await http("DELETE", `/api/account/addresses/${secondData.id}`, { jar });
  }
}

// ---- FAZ 5 Scenarios ---------------------------------------------------

async function scenarioDedicatedUrls() {
  section("FAZ 5: dedicated category & publisher URLs");
  const category = await prisma.category.findFirst({ where: { type: "ana" } });
  const publisher = await prisma.publisher.findFirst();
  if (!category || !publisher) {
    log("have category + publisher", false);
    return;
  }
  const catRes = await http("GET", `/kategoriler/${category.slug}`);
  log(
    "category page 200",
    catRes.ok,
    `status=${catRes.status}`
  );
  const catHtml = await catRes.text();
  log("category page shows name", catHtml.includes(category.name));

  const pubRes = await http("GET", `/yayinevleri/${publisher.slug}`);
  log("publisher page 200", pubRes.ok, `status=${pubRes.status}`);

  // Next.js 16 streaming: notFound() await sonrası 200 döner ama noindex enjekte
  // edilir (Google index etmez).
  const bad = await http("GET", "/kategoriler/nonexistent-slug");
  const badHtml = await bad.text();
  const badNoindex =
    bad.status === 404 || /name="robots"\s+content="noindex"/.test(badHtml);
  log("unknown category 404 or noindex", badNoindex, `status=${bad.status}`);

  // Sitemap should list new URL pattern
  const smRes = await http("GET", "/sitemap.xml");
  const smText = await smRes.text();
  log(
    "sitemap uses /kategoriler/ pattern",
    smText.includes("/kategoriler/")
  );
  log(
    "sitemap uses /yayinevleri/ pattern",
    smText.includes("/yayinevleri/")
  );
}

async function scenarioFullTextSearch() {
  section("FAZ 5: full-text search");

  // Deterministic: create our own product with a unique sentinel word so
  // pagination/popularity ranking can't push it off the first page.
  const sentinel = `Zxqftssentinel${Date.now()}`;
  const sku = `E2E-SKU-FTS-${Date.now()}`;
  const maxNop = await prisma.product.aggregate({ _max: { nopId: true } });
  const created = await prisma.product.create({
    data: {
      sku,
      nopId: (maxNop._max.nopId ?? 0) + 1,
      name: `${sentinel} Test Kitabi`,
      slug: `e2e-fts-${Date.now()}`,
      price: 100,
      vatRate: 0,
      stockQuantity: 1,
      isPublished: true,
    },
  });

  const url = `/urunler?ara=${encodeURIComponent(sentinel)}`;
  const res = await http("GET", url);
  log("search page 200", res.ok, `status=${res.status}`);
  const html = await res.text();
  log("search found the product by sentinel word", html.includes(sentinel));

  await prisma.product.delete({ where: { id: created.id } }).catch(() => {});

  const noise = await http("GET", "/urunler?ara=xxzqwerty12345");
  log(
    "nonsense search still loads (200)",
    noise.ok,
    `status=${noise.status}`
  );
}

async function scenarioCouponFlow() {
  section("FAZ 5: coupon engine + checkout integration");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  // Create a 10% coupon capped at 1 use
  const createRes = await http("POST", "/api/admin/coupons", {
    jar: adminJar,
    body: {
      code: "E2E-TEN",
      kind: "PERCENT",
      value: 10,
      minSubtotal: 0,
      maxUses: 1,
      isActive: true,
    },
  });
  const createData = (await createRes.json()) as { id?: string; error?: string };
  log(
    "admin creates coupon",
    createRes.ok && !!createData.id,
    createData.error ?? `status=${createRes.status}`
  );

  // Duplicate code → 409
  const dup = await http("POST", "/api/admin/coupons", {
    jar: adminJar,
    body: { code: "E2E-TEN", kind: "PERCENT", value: 5, minSubtotal: 0 },
  });
  log("duplicate coupon 409", dup.status === 409, `status=${dup.status}`);

  // Validate endpoint
  const validate = await http("POST", "/api/coupons/validate", {
    body: { code: "E2E-TEN", subtotal: 1000, shippingCost: 30 },
  });
  const vd = (await validate.json()) as {
    discount?: number;
    shippingDiscount?: number;
    error?: string;
  };
  log(
    "coupon validate 200 with correct discount",
    validate.ok && vd.discount === 100,
    vd.error ?? `discount=${vd.discount}`
  );

  // Non-existent code → 400
  const missing = await http("POST", "/api/coupons/validate", {
    body: { code: "NOPE-CODE-123", subtotal: 1000, shippingCost: 0 },
  });
  log(
    "unknown coupon 400",
    missing.status === 400,
    `status=${missing.status}`
  );

  // Customer checkout applies the coupon
  const jar: CookieJar = new Map();
  await login(jar, "e2e-customer@test.local", "secret123");

  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 }, price: { gt: 0 } },
  });
  if (!product) return;

  const orderRes = await http("POST", "/api/orders", {
    jar,
    body: {
      items: [{ productId: product.id, quantity: 1 }],
      shipping: {
        fullName: "E2E Customer",
        email: "e2e-customer@test.local",
        phone: "05551112233",
        city: "İstanbul",
        district: "Kadıköy",
        postalCode: "34000",
        address: "Test Mah. Test Sok. No:1",
      },
      paymentMethod: "CREDIT_CARD",
      card: {
        number: "4242 4242 4242 4242",
        expiry: "12/35",
        cvv: "123",
        holderName: "E2E CUSTOMER",
      },
      couponCode: "E2E-TEN",
    },
  });
  const orderData = (await orderRes.json()) as {
    orderId?: string;
    paymentUrl?: string;
    error?: string;
  };
  log(
    "checkout with coupon 200",
    orderRes.ok && !!orderData.orderId,
    orderData.error ?? `status=${orderRes.status}`
  );

  if (orderData.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderData.orderId },
      select: {
        couponCode: true,
        couponDiscount: true,
        subtotal: true,
        total: true,
      },
    });
    log("order couponCode persisted", order?.couponCode === "E2E-TEN");
    log(
      "couponDiscount > 0",
      order ? Number(order.couponDiscount) > 0 : false,
      `discount=${order?.couponDiscount}`
    );
    // Coupon usedCount should be 1 and reach cap
    const coupon = await prisma.coupon.findUnique({
      where: { code: "E2E-TEN" },
    });
    log("coupon usedCount incremented", coupon?.usedCount === 1);

    // Second order with same coupon should hit the cap (maxUses=1)
    const second = await http("POST", "/api/coupons/validate", {
      body: { code: "E2E-TEN", subtotal: 500, shippingCost: 0 },
    });
    log(
      "capped coupon rejected on next validate (400)",
      second.status === 400
    );
  }

  // Confirm payment so stock accounting is consistent
  if (orderData.paymentUrl) {
    const token = orderData.paymentUrl.split("/").pop()!;
    await http("POST", "/api/payments/mock/confirm", {
      body: { token, action: "success", otp: "123456" },
    });
  }
}

async function scenarioReviewsFlow() {
  section("FAZ 5: reviews submit & moderate");
  // Prior scenarios burn through the 10-attempt login bucket — reset here so
  // the admin moderation step below can still log in.
  await resetRateLimit();
  const jar: CookieJar = new Map();
  await login(jar, "e2e-customer@test.local", "secret123");

  const product = await prisma.product.findFirst({
    where: { isPublished: true },
  });
  if (!product) return;

  // Anonymous → 401
  const anon = await http("POST", "/api/reviews", {
    body: {
      productId: product.id,
      rating: 5,
      comment: "Harika urun, tavsiye ederim.",
    },
  });
  log("anonymous review rejected 401", anon.status === 401);

  // Valid submission
  const res = await http("POST", "/api/reviews", {
    jar,
    body: {
      productId: product.id,
      rating: 5,
      title: "Super",
      comment: "Harika urun, tavsiye ederim.",
    },
  });
  const data = (await res.json()) as { id?: string; error?: string };
  log(
    "review submit 200 (pending)",
    res.ok && !!data.id,
    data.error ?? `status=${res.status}`
  );

  // Duplicate → 409
  const dup = await http("POST", "/api/reviews", {
    jar,
    body: {
      productId: product.id,
      rating: 4,
      comment: "Tekrar denedim.",
    },
  });
  log("duplicate review rejected 409", dup.status === 409);

  // Admin moderates
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");
  if (data.id) {
    const approveRes = await http("PATCH", `/api/admin/reviews/${data.id}`, {
      jar: adminJar,
      body: { status: "APPROVED" },
    });
    log("admin approves review", approveRes.ok, `status=${approveRes.status}`);
  }

  // Product detail should now include the review
  const detail = await http("GET", `/urunler/${product.slug}`);
  const html = await detail.text();
  log("approved review shown on product page", html.includes("Harika urun"));
  log("JSON-LD includes AggregateRating", html.includes("AggregateRating"));
}

async function scenarioGuestOrderTrack() {
  section("FAZ 5: guest order tracking");
  // Seed order from earlier scenarios belongs to e2e-customer.
  const order = await prisma.order.findFirst({
    where: { user: { email: "e2e-customer@test.local" } },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    log("have a test order", false);
    return;
  }

  // Correct combo renders the order card
  const ok = await http(
    "GET",
    `/siparis-takip?no=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent("e2e-customer@test.local")}`
  );
  log("tracking form 200", ok.ok, `status=${ok.status}`);
  const okHtml = await ok.text();
  log("tracking shows order number", okHtml.includes(order.orderNumber));

  // Wrong email → friendly error (but page still 200)
  const wrongEmail = await http(
    "GET",
    `/siparis-takip?no=${encodeURIComponent(order.orderNumber)}&email=wrong@test.local`
  );
  const wrongHtml = await wrongEmail.text();
  log(
    "wrong email shows not-found message",
    wrongHtml.includes("bulunamadi")
  );
}

// ---- FAZ 6 Scenarios ---------------------------------------------------

async function scenarioClientErrorLogging() {
  section("FAZ 6: client error logging + admin error log page");
  const before = await prisma.errorLog.count({ where: { source: "client" } });
  const res = await http("POST", "/api/client-error", {
    body: {
      message: "E2E test — generated client error",
      stack: "fake stack trace line 1\nline 2",
      url: "/test/page",
    },
  });
  log("client error endpoint accepts 200", res.ok, `status=${res.status}`);
  // Fire-and-forget DB write — give the async handler a beat.
  await new Promise((r) => setTimeout(r, 500));
  const after = await prisma.errorLog.count({ where: { source: "client" } });
  log(
    "client error row persisted",
    after >= before + 1,
    `before=${before} after=${after}`
  );

  const bad = await http("POST", "/api/client-error", { body: {} });
  log(
    "invalid payload still returns 200 (fail-open)",
    bad.ok,
    `status=${bad.status}`
  );

  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");
  const page = await http("GET", "/admin/error-log", { jar: adminJar });
  log("admin error log page renders", page.ok, `status=${page.status}`);
}

async function scenarioPageviewTracking() {
  section("FAZ 6: pageview tracking");
  const beforeCount = await prisma.pageView.count();
  const res = await http("POST", "/api/pageview", {
    body: { path: "/e2e-test-path", sessionId: "e2e-session" },
  });
  log("pageview endpoint 200", res.ok, `status=${res.status}`);
  await new Promise((r) => setTimeout(r, 500));
  const afterCount = await prisma.pageView.count();
  log(
    "pageview row inserted",
    afterCount > beforeCount,
    `before=${beforeCount} after=${afterCount}`
  );

  const admin = await http("POST", "/api/pageview", {
    body: { path: "/admin/siparisler", sessionId: "e2e-session" },
  });
  log("admin path skipped by endpoint", admin.ok);
  const rejected = await prisma.pageView.findFirst({
    where: { path: "/admin/siparisler" },
  });
  log("admin path not persisted", rejected === null);

  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");
  const analyticsPage = await http("GET", "/admin/analytics", {
    jar: adminJar,
  });
  log(
    "admin analytics page renders",
    analyticsPage.ok,
    `status=${analyticsPage.status}`
  );
}

async function scenarioEmailLog() {
  section("FAZ 3: admin email log");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  const res = await http("GET", "/admin/email-log", { jar: adminJar });
  log("email log loads for admin", res.ok, `status=${res.status}`);

  const count = await prisma.emailLog.count();
  log("email logs exist from earlier scenarios", count > 0, `count=${count}`);
}

async function scenarioUserRoleChange() {
  section("Admin: user role change & safeguards");
  const adminJar: CookieJar = new Map();
  await login(adminJar, "admin@mastereducation.com.tr", "admin123");

  // Create a throwaway customer
  await http("POST", "/api/auth/register", {
    body: {
      name: "Role Target",
      email: "e2e-role-target@test.local",
      password: "secret123",
      phone: "",
    },
  });
  const target = await prisma.user.findUnique({
    where: { email: "e2e-role-target@test.local" },
  });
  if (!target) {
    log("target user exists", false);
    return;
  }

  // CUSTOMER → DEALER should fail (no Dealer record)
  const badPromote = await http(
    "PATCH",
    `/api/admin/users/${target.id}/role`,
    { jar: adminJar, body: { role: "DEALER" } }
  );
  log(
    "cannot promote to DEALER without application (400)",
    badPromote.status === 400,
    `status=${badPromote.status}`
  );

  // CUSTOMER → ADMIN should succeed
  const promote = await http(
    "PATCH",
    `/api/admin/users/${target.id}/role`,
    { jar: adminJar, body: { role: "ADMIN" } }
  );
  log("promote to ADMIN", promote.ok, `status=${promote.status}`);

  // Admin demoting self — use current admin session
  const selfDemote = await http(
    "PATCH",
    `/api/admin/users/admin-self-placeholder/role`,
    { jar: adminJar, body: { role: "CUSTOMER" } }
  );
  // The placeholder won't match — but the admin's own id should. Fetch it.
  const admin = await prisma.user.findUnique({
    where: { email: "admin@mastereducation.com.tr" },
  });
  if (admin) {
    const selfRes = await http(
      "PATCH",
      `/api/admin/users/${admin.id}/role`,
      { jar: adminJar, body: { role: "CUSTOMER" } }
    );
    log(
      "admin cannot demote self (400)",
      selfRes.status === 400,
      `status=${selfRes.status}`
    );
  }
  // selfDemote was a dummy 404 call — quiet it
  void selfDemote;

  // Cleanup: delete our target (who is now ADMIN, need to demote first since
  // admin-count check kicks in only if target is the last admin; we still have
  // the seeded admin so delete should work).
  const delRes = await http(
    "DELETE",
    `/api/admin/users/${target.id}`,
    { jar: adminJar }
  );
  log("admin can delete a user with no orders", delRes.ok, `status=${delRes.status}`);
}

// ---- Runner -------------------------------------------------------------

async function resetRateLimit() {
  await http("POST", "/api/dev-test/reset-rate-limit").catch(() => null);
}

async function main() {
  console.log(`\nMaster Education E2E scenarios @ ${BASE}\n`);
  try {
    await resetRateLimit();
    await cleanupTestData();
    await scenarioServerUp();
    await scenarioRobotsAndSitemap();
    await scenarioSecurityHeaders();
    await scenarioCustomerRegisterAndOrder();
    await scenarioInvalidOrder();
    await scenarioCartRefresh();
    await scenarioDealerFlow();
    await scenarioPasswordResetInvalidation();
    await scenarioAdminProductCrud();
    await scenarioSoftDeleteOnOrderedProduct();
    await scenarioTaxonomyCrud();
    await scenarioProductImageUpload();
    await scenarioLedgerAndPayments();
    await scenarioCustomerPaymentSuccess();
    await scenarioCustomerPaymentFailure();
    await scenarioInvalidCard();
    await scenarioAutoTrackingAndPage();
    await scenarioEmailLog();
    await scenarioDealerDiscountsView();
    await scenarioDealerDocuments();
    await scenarioBulkOrder();
    await scenarioAddressManagement();
    await scenarioDedicatedUrls();
    await scenarioFullTextSearch();
    await scenarioCouponFlow();
    await scenarioReviewsFlow();
    await scenarioGuestOrderTrack();
    await scenarioClientErrorLogging();
    await scenarioPageviewTracking();
    await scenarioUserRoleChange();
    await scenarioRateLimit();
    await scenarioAuditLog();
  } catch (err) {
    console.error("Scenario runner crashed:", err);
    process.exitCode = 1;
  } finally {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log(
      `\n=== Summary: ${passed} pass / ${failed} fail / ${results.length} total ===`
    );
    if (failed > 0) {
      console.log("\nFailed checks:");
      for (const r of results) {
        if (!r.ok) console.log(`  - ${r.name}: ${r.detail}`);
      }
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  }
}

main();
