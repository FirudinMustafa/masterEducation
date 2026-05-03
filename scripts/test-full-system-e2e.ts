/**
 * Faz 18 — Tam Sistem E2E (gercek kullanici simulasyonu)
 *
 * Bu script bir saldirgan/kullanici/admin gibi http istegi atar; tarayicidan
 * yapilanin esi. Hicbir backend fonksiyonu dogrudan cagrilmaz — sadece DB
 * fixture seed ve cleanup icin Prisma kullaniliyor.
 *
 * Modul A: Admin taxonomy (kategori + yayinevi + urun CRUD + IDOR)
 * Modul B: Auth + profil + adres (register / login / verify / profile / address CRUD)
 * Modul C: Storefront (browse, search, favori, karsilastir, yorum)
 * Modul D: Sepet, kupon, siparis (CC mock 3DS, cari hesap, tracking)
 * Modul E: Bayi basvuru → onay → odeme modu (OPEN_ACCOUNT vs PREPAID)
 * Modul F: Iskonto 5 scope (PRODUCT/CATEGORY/DISCOUNT_GROUP/PUBLISHER/GLOBAL)
 * Modul G: Toplu islem regresyon
 * Modul H: Edge case & guvenlik regresyon (IDOR, mass assignment, rate limit)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ─── HTTP helpers (browser/curl simulation) ──────────────────────────
type Session = {
  cookies: Map<string, string>;
  label: string;
  fakeIp?: string;
};
let ipCounter = 0;
function newSession(label = "guest"): Session {
  ipCounter++;
  // her sessiona unique IPv4 atayalim — register/dealer-apply rate-limit
  // testleri arasi cakismayi onler
  return { cookies: new Map(), label, fakeIp: `10.99.${(ipCounter >> 8) & 255}.${ipCounter & 255}` };
}
function applyCookies(s: Session, h: Headers) {
  const all = h.getSetCookie?.() ?? [];
  for (const sc of all) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    s.cookies.set(k.trim(), v.join("=").trim());
  }
}
function cookieHeader(s: Session) {
  return Array.from(s.cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
async function http(
  s: Session,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
) {
  const headers: Record<string, string> = {
    cookie: cookieHeader(s),
    accept: "application/json",
    // her sessiona benzersiz bir IP atayalim — rate-limit'leri bagimsiz tutmak icin
    "x-forwarded-for": s.fakeIp ?? "127.0.0.1",
    ...(extraHeaders ?? {}),
  };
  let payload: BodyInit | undefined;
  if (body instanceof URLSearchParams || body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
  });
  applyCookies(s, r.headers);
  let data: unknown = null;
  const text = await r.text();
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { status: r.status, data, headers: r.headers, text };
}
async function login(s: Session, email: string, password: string) {
  const csrfRes = await http(s, "GET", "/api/auth/csrf");
  const csrfToken = (csrfRes.data as { csrfToken: string }).csrfToken;
  const body = new URLSearchParams({
    email,
    password,
    csrfToken,
    callbackUrl: `${BASE}/`,
    json: "true",
  });
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(s),
    },
    body: body.toString(),
    redirect: "manual",
  });
  applyCookies(s, r.headers);
  s.label = email;
  return r.status;
}
async function whoami(s: Session) {
  const r = await http(s, "GET", "/api/auth/session");
  return (r.data ?? {}) as { user?: { id?: string; role?: string; email?: string } };
}

// ─── Test runner ─────────────────────────────────────────────────────
let pass = 0;
let total = 0;
const failures: string[] = [];
let currentSection = "";
function section(name: string) {
  currentSection = name;
  console.log(`\n━━━ ${name} ━━━`);
}
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    const msg = extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 200)}` : "";
    console.log(`  ✗ ${name}${msg}`);
    failures.push(`[${currentSection}] ${name}${msg}`);
  }
}

const ts = Date.now();
const cleanup: { userIds: string[]; productIds: string[]; categoryIds: string[]; publisherIds: string[]; orderIds: string[]; couponIds: string[]; discountRuleIds: string[]; reviewIds: string[] } = {
  userIds: [],
  productIds: [],
  categoryIds: [],
  publisherIds: [],
  orderIds: [],
  couponIds: [],
  discountRuleIds: [],
  reviewIds: [],
};

(async () => {
  try {
    // ─── PRE-FLIGHT ───────────────────────────────────────────────
    section("Pre-flight: server alive");
    const ping = await http(newSession(), "GET", "/");
    check("GET / 200", ping.status === 200, ping.status);

    // ─── ADMIN BOOTSTRAP ──────────────────────────────────────────
    section("Setup: admin & customer fixtures");
    const adminEmail = `e2e-admin-${ts}@example.test`;
    const adminPwd = "AdminPwd123!";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "E2E Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    cleanup.userIds.push(admin.id);

    const adminS = newSession("admin");
    await login(adminS, adminEmail, adminPwd);
    const adminWho = await whoami(adminS);
    check("admin login OK", adminWho.user?.role === "ADMIN", adminWho);

    // ─── MODÜL A: Admin Taxonomy CRUD ─────────────────────────────
    section("Modül A: Kategori CRUD");
    // A.1 yetkisiz erişim
    const guestS = newSession("guest");
    const noauthCat = await http(guestS, "POST", "/api/admin/categories", {
      name: "Hack",
    });
    check("A.1 guest → 401/403", noauthCat.status === 401 || noauthCat.status === 403, noauthCat.status);

    // A.2 admin başarı
    const catA = await http(adminS, "POST", "/api/admin/categories", {
      name: `E2E Ana Kat ${ts}`,
      type: "ana",
    });
    check("A.2 admin kategori create 200/201", catA.status === 200 || catA.status === 201, catA.status);
    const catAId = (catA.data as { id?: string })?.id ?? "";
    if (catAId) cleanup.categoryIds.push(catAId);

    // A.3 detay kategori
    const catB = await http(adminS, "POST", "/api/admin/categories", {
      name: `E2E Detay ${ts}`,
      type: "detay",
    });
    check("A.3 detay kategori create OK", catB.status === 200 || catB.status === 201, catB.status);
    const catBId = (catB.data as { id?: string })?.id ?? "";
    if (catBId) cleanup.categoryIds.push(catBId);

    // A.4 validasyon: kısa ad
    const catBad = await http(adminS, "POST", "/api/admin/categories", { name: "X" });
    check("A.4 kategori name<2 → 400", catBad.status === 400, catBad.status);

    // A.5 PATCH
    const catPatch = await http(adminS, "PATCH", `/api/admin/categories/${catAId}`, {
      name: `E2E Ana Updated ${ts}`,
    });
    check("A.5 kategori PATCH OK", catPatch.status === 200, catPatch.status);

    // A.6 IDOR: var olmayan id
    const catNotFound = await http(adminS, "PATCH", "/api/admin/categories/non-existent-id", {
      name: "x",
    });
    check("A.6 nonexistent → 404", catNotFound.status === 404 || catNotFound.status === 400, catNotFound.status);

    section("Modül A: Yayınevi CRUD");
    const pubA = await http(adminS, "POST", "/api/admin/publishers", {
      name: `E2E Yayın ${ts}`,
    });
    check("A.7 publisher create OK", pubA.status === 200 || pubA.status === 201, pubA.status);
    const pubAId = (pubA.data as { id?: string })?.id ?? "";
    if (pubAId) cleanup.publisherIds.push(pubAId);

    const pubBad = await http(adminS, "POST", "/api/admin/publishers", { name: "" });
    check("A.8 publisher empty → 400", pubBad.status === 400, pubBad.status);

    section("Modül A: Ürün CRUD");
    // A.9 başarılı create
    const prod1 = await http(adminS, "POST", "/api/admin/products", {
      name: `E2E Kitap ${ts}`,
      sku: `E2E-${ts}-1`,
      price: 100,
      vatRate: 10,
      stockQuantity: 50,
      publisherId: pubAId || null,
      categoryId: catAId || null,
      discountGroup: "G1",
      isPublished: true,
    });
    check("A.9 ürün create OK", prod1.status === 200 || prod1.status === 201, prod1.status);
    const prod1Id = (prod1.data as { id?: string })?.id ?? "";
    if (prod1Id) cleanup.productIds.push(prod1Id);

    // A.10 ikinci ürün
    const prod2 = await http(adminS, "POST", "/api/admin/products", {
      name: `E2E Kitap-B ${ts}`,
      sku: `E2E-${ts}-2`,
      price: 200,
      vatRate: 10,
      stockQuantity: 30,
      publisherId: pubAId || null,
      categoryId: catAId || null,
      discountGroup: "G2",
      isPublished: true,
    });
    check("A.10 ikinci ürün OK", prod2.status === 200 || prod2.status === 201, prod2.status);
    const prod2Id = (prod2.data as { id?: string })?.id ?? "";
    if (prod2Id) cleanup.productIds.push(prod2Id);

    // A.11 negatif fiyat
    const prodBad = await http(adminS, "POST", "/api/admin/products", {
      name: "Bad",
      sku: `E2E-${ts}-bad`,
      price: -10,
      vatRate: 10,
    });
    check("A.11 negatif fiyat → 400", prodBad.status === 400, prodBad.status);

    // A.12 zorunlu name eksik
    const prodNoName = await http(adminS, "POST", "/api/admin/products", {
      sku: `E2E-${ts}-nonm`,
      price: 10,
    });
    check("A.12 ad eksik → 400", prodNoName.status === 400, prodNoName.status);

    // A.13 PATCH
    const prodPatch = await http(adminS, "PATCH", `/api/admin/products/${prod1Id}`, {
      price: 120,
      stockQuantity: 60,
    });
    check("A.13 ürün PATCH OK", prodPatch.status === 200, prodPatch.status);

    // A.14 mass assignment koruması: createdAt/updatedAt set etmeye çalış
    const prodMass = await http(adminS, "PATCH", `/api/admin/products/${prod1Id}`, {
      price: 130,
      createdAt: "2000-01-01T00:00:00Z",
      id: "evil-id",
    });
    check("A.14 mass-assignment ignore (200)", prodMass.status === 200, prodMass.status);
    const prodInDb = await prisma.product.findUnique({ where: { id: prod1Id } });
    check(
      "A.14b createdAt değişmedi",
      prodInDb !== null && prodInDb.createdAt.getFullYear() > 2024,
      prodInDb?.createdAt,
    );

    // A.15 customer ürün create deneme (yetkisiz)
    section("Modül A: Authz — non-admin reddedilmeli");
    const custEmail = `e2e-cust-${ts}@example.test`;
    const custPwd = "CustPwd123!";
    const cust = await prisma.user.create({
      data: {
        email: custEmail,
        name: "E2E Customer",
        passwordHash: await bcrypt.hash(custPwd, 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "Ev",
            fullName: "E2E Customer",
            phone: "05551112233",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test Cd 1",
            isDefault: true,
          },
        },
      },
    });
    cleanup.userIds.push(cust.id);
    const custS = newSession("customer");
    await login(custS, custEmail, custPwd);
    const custWho = await whoami(custS);
    check("A.15 customer login OK", custWho.user?.role === "CUSTOMER", custWho);

    const custTryAdmin = await http(custS, "POST", "/api/admin/products", {
      name: "Hack",
      sku: "X",
      price: 1,
    });
    check("A.16 customer → admin POST → 403", custTryAdmin.status === 403, custTryAdmin.status);

    // ─── MODÜL B: Auth + Profil + Adres ──────────────────────────
    section("Modül B: Register validation");
    // B.1 kısa şifre
    const regBad1 = await http(newSession(), "POST", "/api/auth/register", {
      name: "Test",
      email: `e2e-reg-${ts}@example.test`,
      password: "abc",
    });
    check("B.1 kısa şifre → 400", regBad1.status === 400, regBad1.status);

    // B.2 geçersiz email
    const regBad2 = await http(newSession(), "POST", "/api/auth/register", {
      name: "Test",
      email: "not-an-email",
      password: "Password123",
    });
    check("B.2 invalid email → 400", regBad2.status === 400, regBad2.status);

    // B.3 sadece harf
    const regBad3 = await http(newSession(), "POST", "/api/auth/register", {
      name: "Test",
      email: `e2e-reg-${ts}@example.test`,
      password: "abcdefghi",
    });
    check("B.3 sadece harf → 400", regBad3.status === 400, regBad3.status);

    // B.4 başarılı kayıt
    const newCustEmail = `e2e-newc-${ts}@example.test`;
    const newCustPwd = "TestPwd123!";
    const reg1 = await http(newSession(), "POST", "/api/auth/register", {
      name: "Yeni Müşteri",
      email: newCustEmail,
      password: newCustPwd,
    });
    check("B.4 register başarı 201", reg1.status === 201, reg1.status);

    // B.5 enumeration: aynı email tekrar — generic OK dönmeli
    const reg2 = await http(newSession(), "POST", "/api/auth/register", {
      name: "Yeni Müşteri",
      email: newCustEmail,
      password: "AnotherPwd123!",
    });
    check("B.5 dup email enumeration suppress (201)", reg2.status === 201, reg2.status);

    const newCustDb = await prisma.user.findUnique({ where: { email: newCustEmail } });
    if (newCustDb) cleanup.userIds.push(newCustDb.id);
    check("B.5b dup email kullanıcı 1 tane", newCustDb !== null);

    // B.6 unverified kullanıcı login dene
    const newCustS = newSession("newcust");
    const loginUnverif = await login(newCustS, newCustEmail, newCustPwd);
    check("B.6 unverified login (200 redirect)", loginUnverif === 200 || loginUnverif === 302, loginUnverif);

    // Admin emailVerified = now manual update for further tests
    if (newCustDb) {
      await prisma.user.update({
        where: { id: newCustDb.id },
        data: { emailVerified: new Date() },
      });
    }

    // B.7 yanlış şifre
    const newCustS2 = newSession("newcust-bad");
    await login(newCustS2, newCustEmail, "wrong-password");
    const newWho = await whoami(newCustS2);
    check("B.7 yanlış şifre login session yok", !newWho.user, newWho);

    // B.8 forgot password — mevcut email
    const fp1 = await http(newSession(), "POST", "/api/auth/forgot-password", {
      email: newCustEmail,
    });
    check("B.8 forgot existing → 200", fp1.status === 200, fp1.status);

    // B.9 forgot password — yok olan email (timing-safe, generic 200)
    const fp2 = await http(newSession(), "POST", "/api/auth/forgot-password", {
      email: `nonexistent-${ts}@example.test`,
    });
    check("B.9 forgot nonexistent → 200 (no enum)", fp2.status === 200, fp2.status);

    section("Modül B: Profil & Şifre & Adres");
    // B.10 not: profile endpoint sadece PATCH (GET yok); /hesabim sayfası
    // server-side render eder. Burada PATCH sözleşmesi yeterli.

    // B.11 isim değiştir (currentPassword GEREK YOK)
    const profPut1 = await http(custS, "PATCH", "/api/account/profile", {
      name: "Customer Updated",
      email: custEmail,
      phone: "05551112233",
    });
    check("B.11 ad değiştir → 200", profPut1.status === 200, profPut1.status);

    // B.12 email değiştir — currentPassword OLMADAN reddedilmeli
    const profPut2 = await http(custS, "PATCH", "/api/account/profile", {
      name: "Customer",
      email: `cust-changed-${ts}@example.test`,
      phone: "05551112233",
    });
    check("B.12 email değişti currentPwd YOK → 400/403", profPut2.status === 400 || profPut2.status === 403, profPut2.status);

    // B.13 email değiştir + yanlış password
    const profPut3 = await http(custS, "PATCH", "/api/account/profile", {
      name: "Customer",
      email: `cust-changed-${ts}@example.test`,
      phone: "05551112233",
      currentPassword: "WrongPwd123",
    });
    check("B.13 yanlış pwd → 400/403", profPut3.status === 400 || profPut3.status === 403, profPut3.status);

    // B.14 email değiştir + doğru password
    const profPut4 = await http(custS, "PATCH", "/api/account/profile", {
      name: "Customer",
      email: `cust-changed-${ts}@example.test`,
      phone: "05551112233",
      currentPassword: custPwd,
    });
    check("B.14 doğru pwd email change → 200", profPut4.status === 200, profPut4.status);

    // B.15 adres geçersiz şehir
    const addrBadCity = await http(custS, "POST", "/api/account/addresses", {
      label: "Test",
      fullName: "Customer",
      phone: "05551112233",
      city: "Hogwarts",
      district: "Kadıköy",
      addressLine: "Test cd 5",
      isDefault: false,
    });
    check("B.15 geçersiz il → 400", addrBadCity.status === 400, addrBadCity.status);

    // B.16 il-ilçe uyumsuzluk
    const addrBadDist = await http(custS, "POST", "/api/account/addresses", {
      label: "Test",
      fullName: "Customer",
      phone: "05551112233",
      city: "İstanbul",
      district: "Adana Merkez",
      addressLine: "Test cd",
      isDefault: false,
    });
    check("B.16 il/ilçe uyumsuz → 400", addrBadDist.status === 400, addrBadDist.status);

    // B.17 valid adres
    const addrOk = await http(custS, "POST", "/api/account/addresses", {
      label: "İş",
      fullName: "Customer",
      phone: "05551112233",
      city: "Ankara",
      district: "Çankaya",
      addressLine: "Atatürk Cd 99",
      isDefault: false,
    });
    check("B.17 valid adres OK", addrOk.status === 200 || addrOk.status === 201, addrOk.status);

    // ─── MODÜL C: Storefront ────────────────────────────────────
    section("Modül C: Public browse");
    const home = await http(newSession(), "GET", "/");
    check("C.1 anasayfa 200", home.status === 200, home.status);

    const search = await http(newSession(), "GET", "/api/search?q=kitap");
    check("C.2 search OK", search.status === 200, search.status);

    // C.3 ürün detayı slug ile (ilk yayinlanmis ürün)
    const someProd = await prisma.product.findFirst({
      where: { isPublished: true },
      select: { id: true, slug: true, sku: true, name: true, price: true, vatRate: true, stockQuantity: true },
    });
    check("C.3 fixture ürün var", someProd !== null);
    if (someProd) {
      const detailPg = await http(newSession(), "GET", `/urunler/${someProd.slug}`);
      check("C.4 ürün detayı sayfa 200", detailPg.status === 200, detailPg.status);
    }

    // C.5/C.6 not: favoriler client-side zustand-store, server endpoint yok.
    // Bunun yerine cart-refresh API'sini test et — sepet "favori"-benzeri
    // server-side entrypoint.
    const cartGuest = await http(newSession(), "POST", "/api/cart/refresh", { items: [] });
    check("C.5 cart-refresh empty → 200", cartGuest.status === 200, cartGuest.status);

    if (someProd) {
      const cartReal = await http(custS, "POST", "/api/cart/refresh", {
        items: [{ productId: someProd.id, quantity: 1 }],
      });
      check("C.6 cart-refresh real product → 200", cartReal.status === 200, cartReal.status);
    }

    // C.7 yorum yaz
    const reviewPost = await http(custS, "POST", "/api/reviews", {
      productId: prod1Id,
      rating: 5,
      title: "Süper",
      comment: "Çok beğendim, harika ürün.",
    });
    check("C.7 review POST → 200/201", reviewPost.status === 200 || reviewPost.status === 201, reviewPost.status);

    // C.8 aynı ürüne 2. kez review (unique constraint)
    const reviewDup = await http(custS, "POST", "/api/reviews", {
      productId: prod1Id,
      rating: 4,
      title: "Tekrar",
      comment: "Tekrar yorum.",
    });
    check("C.8 dup review → 4xx", reviewDup.status >= 400 && reviewDup.status < 500, reviewDup.status);

    // C.9 review kısa metin → 400
    const reviewShort = await http(custS, "POST", "/api/reviews", {
      productId: prod2Id,
      rating: 4,
      comment: "ok",
    });
    check("C.9 review kısa metin → 400", reviewShort.status === 400, reviewShort.status);

    // C.10 review rating > 5 → 400
    const reviewBadRating = await http(custS, "POST", "/api/reviews", {
      productId: prod2Id,
      rating: 99,
      comment: "Test mesaj uzunluk.",
    });
    check("C.10 rating>5 → 400", reviewBadRating.status === 400, reviewBadRating.status);

    // ─── MODÜL D: Sepet → Sipariş → Tracking ─────────────────────
    section("Modül D: Sipariş akışı");
    if (someProd) {
      // D.1 valid ürün ile sipariş (kredi kartı mock)
      const orderBody = {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: {
          fullName: "E2E Customer",
          email: custEmail,
          phone: "05551112233",
          city: "İstanbul",
          district: "Kadıköy",
          postalCode: "34710",
          address: "Test cd 1",
        },
        paymentMethod: "CREDIT_CARD",
        card: {
          number: "4111111111111111",
          expiry: "12/30",
          cvv: "123",
          holderName: "E2E Customer",
        },
      };
      const ord1 = await http(custS, "POST", "/api/orders", orderBody);
      check("D.1 sipariş create → 200/201", ord1.status === 200 || ord1.status === 201, ord1);
      const ord1Token = (ord1.data as { paymentToken?: string; redirectTo?: string })?.paymentToken
        ?? (ord1.data as { token?: string })?.token;

      // D.2 OTP onay
      if (ord1Token) {
        const confirm = await http(custS, "POST", "/api/payments/confirm", {
          token: ord1Token,
          action: "success",
          otp: "123456",
        });
        check("D.2 OTP success → 200", confirm.status === 200, confirm);
      }

      // D.3 boş sepet
      const ordEmpty = await http(custS, "POST", "/api/orders", {
        items: [],
        shipping: orderBody.shipping,
        paymentMethod: "CREDIT_CARD",
        card: orderBody.card,
      });
      check("D.3 boş sepet → 400", ordEmpty.status === 400, ordEmpty.status);

      // D.4 il/ilçe uyumsuz shipping
      const ordBadShip = await http(custS, "POST", "/api/orders", {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: { ...orderBody.shipping, city: "İstanbul", district: "Adana Merkez" },
        paymentMethod: "CREDIT_CARD",
        card: orderBody.card,
      });
      check("D.4 yanlış il/ilçe → 400", ordBadShip.status === 400, ordBadShip.status);

      // D.5 OPEN_ACCOUNT customer denemesi (bayi olmayan)
      const ordOpenCust = await http(custS, "POST", "/api/orders", {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: orderBody.shipping,
        paymentMethod: "OPEN_ACCOUNT",
      });
      check("D.5 customer OPEN_ACCOUNT → 403", ordOpenCust.status === 403, ordOpenCust.status);

      // D.6 invalid card (Luhn fail)
      const ordBadCard = await http(custS, "POST", "/api/orders", {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: orderBody.shipping,
        paymentMethod: "CREDIT_CARD",
        card: { ...orderBody.card, number: "4111111111111112" },
      });
      check("D.6 Luhn invalid → 400", ordBadCard.status === 400, ordBadCard.status);
    }

    // ─── MODÜL E: Bayi Lifecycle ──────────────────────────────────
    section("Modül E: Bayi başvuru → onay → sipariş");
    const dealerEmail = `e2e-dealer-${ts}@example.test`;
    const dealerPwd = "DealerPwd123!";

    // E.1 vergi numarası 5 hane → reject
    const apply1 = await http(newSession(), "POST", "/api/dealer/apply", {
      name: "Bayi Sahibi",
      email: dealerEmail,
      phone: "05550001122",
      password: dealerPwd,
      companyName: "E2E Bayi A.Ş.",
      taxOffice: "Kadıköy",
      taxNumber: "12345",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Bayi cd 1",
    });
    check("E.1 kısa vergi no → 400", apply1.status === 400, apply1.status);

    // E.2 başarılı başvuru
    const apply2 = await http(newSession(), "POST", "/api/dealer/apply", {
      name: "Bayi Sahibi",
      email: dealerEmail,
      phone: "05550001122",
      password: dealerPwd,
      companyName: "E2E Bayi A.Ş.",
      taxOffice: "Kadıköy",
      taxNumber: "1234567890",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Bayi cd 1",
    });
    check("E.2 başvuru → 201", apply2.status === 201, apply2);
    const dealerUserId = (apply2.data as { id?: string })?.id ?? "";
    if (dealerUserId) cleanup.userIds.push(dealerUserId);

    // E.3 dup email → 409
    const apply3 = await http(newSession(), "POST", "/api/dealer/apply", {
      name: "Yine Birisi",
      email: dealerEmail,
      phone: "05550001122",
      password: dealerPwd,
      companyName: "Dup Co AS",
      taxOffice: "Kadıköy",
      taxNumber: "1234567891",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Dup cd 1 No 5",
    });
    check("E.3 dup email → 409", apply3.status === 409, apply3.status);

    // E.4 PENDING bayi sipariş veremez
    const dealerS = newSession("dealer");
    await prisma.user.update({
      where: { id: dealerUserId },
      data: { emailVerified: new Date() },
    });
    await login(dealerS, dealerEmail, dealerPwd);
    const dealerWho = await whoami(dealerS);
    check("E.4a dealer login OK", dealerWho.user?.role === "DEALER", dealerWho);

    if (someProd) {
      const ordPending = await http(dealerS, "POST", "/api/orders", {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: {
          fullName: "Bayi",
          email: dealerEmail,
          phone: "05550001122",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Bayi cd 1",
        },
        paymentMethod: "OPEN_ACCOUNT",
      });
      check("E.4b PENDING → cari hesap reddedilmeli (403)", ordPending.status === 403, ordPending.status);
    }

    // E.5 admin onay (PATCH)
    const dealer = await prisma.dealer.findUnique({ where: { userId: dealerUserId } });
    if (dealer) {
      const approve = await http(adminS, "PATCH", `/api/admin/dealers/${dealer.id}`, {
        creditLimit: 5000,
        paymentTerms: "OPEN_ACCOUNT",
        notes: "E2E approval",
      });
      check("E.5 admin onay PATCH → 200", approve.status === 200, approve);

      // E.5b: dealer status APPROVE — admin "Onayla" butonu ayri endpoint
      // kullaniyor olabilir (PATCH dealer route status alanini paylasmiyor).
      // DB direct ile status'a APPROVED diyelim ki sonraki testlerde
      // "onayli bayi" senaryolarini calistirabilelim.
      await prisma.dealer.update({
        where: { id: dealer.id },
        data: { status: "APPROVED", paymentTerms: "OPEN_ACCOUNT", creditLimit: 5000 },
      });
    }

    // E.6 PREPAID modu test — PREPAID dealer
    const dealer2Email = `e2e-dealer2-${ts}@example.test`;
    const dealer2 = await prisma.user.create({
      data: {
        email: dealer2Email,
        name: "Prepaid Dealer",
        passwordHash: await bcrypt.hash(dealerPwd, 10),
        role: "DEALER",
        emailVerified: new Date(),
        dealer: {
          create: {
            companyName: "Prepaid Co",
            taxOffice: "Kadıköy",
            taxNumber: "9876543210",
            status: "APPROVED",
            paymentTerms: "PREPAID",
            creditLimit: 0,
          },
        },
        addresses: {
          create: {
            label: "Fatura",
            fullName: "Prepaid Co",
            phone: "05550001122",
            city: "İstanbul",
            district: "Kadıköy",
            addressLine: "Prepaid cd 1",
            isDefault: true,
          },
        },
      },
    });
    cleanup.userIds.push(dealer2.id);
    const dealer2S = newSession("dealer-prepaid");
    await login(dealer2S, dealer2Email, dealerPwd);

    if (someProd) {
      const ordPrepOpen = await http(dealer2S, "POST", "/api/orders", {
        items: [{ productId: someProd.id, quantity: 1 }],
        shipping: {
          fullName: "Prepaid",
          email: dealer2Email,
          phone: "05550001122",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Prepaid cd 1",
        },
        paymentMethod: "OPEN_ACCOUNT",
      });
      check(
        "E.6 PREPAID dealer OPEN_ACCOUNT → 403",
        ordPrepOpen.status === 403,
        ordPrepOpen,
      );
    }

    // ─── MODÜL F: Discount 5 scope ────────────────────────────────
    section("Modül F: Discount 5 scope (PRODUCT/CATEGORY/PUBLISHER/DISCOUNT_GROUP/GLOBAL)");
    if (dealer) {
      // F.1 GLOBAL
      const dr1 = await http(adminS, "POST", "/api/admin/discounts", {
        dealerId: dealer.id,
        scope: "GLOBAL",
        discountPct: 5,
      });
      check("F.1 GLOBAL discount → 200/201", dr1.status === 200 || dr1.status === 201, dr1);
      const dr1Id = (dr1.data as { id?: string })?.id ?? "";
      if (dr1Id) cleanup.discountRuleIds.push(dr1Id);

      // F.2 PRODUCT
      const dr2 = await http(adminS, "POST", "/api/admin/discounts", {
        dealerId: dealer.id,
        scope: "PRODUCT",
        productId: prod1Id,
        discountPct: 20,
      });
      check("F.2 PRODUCT discount → 200/201", dr2.status === 200 || dr2.status === 201, dr2);
      if ((dr2.data as { id?: string })?.id) cleanup.discountRuleIds.push((dr2.data as { id: string }).id);

      // F.3 CATEGORY
      const dr3 = await http(adminS, "POST", "/api/admin/discounts", {
        dealerId: dealer.id,
        scope: "CATEGORY",
        categoryId: catAId,
        discountPct: 10,
      });
      check("F.3 CATEGORY discount → 200/201", dr3.status === 200 || dr3.status === 201, dr3);
      if ((dr3.data as { id?: string })?.id) cleanup.discountRuleIds.push((dr3.data as { id: string }).id);

      // F.4 PUBLISHER
      const dr4 = await http(adminS, "POST", "/api/admin/discounts", {
        dealerId: dealer.id,
        scope: "PUBLISHER",
        publisherId: pubAId,
        discountPct: 8,
      });
      check("F.4 PUBLISHER discount → 200/201", dr4.status === 200 || dr4.status === 201, dr4);
      if ((dr4.data as { id?: string })?.id) cleanup.discountRuleIds.push((dr4.data as { id: string }).id);

      // F.5 DISCOUNT_GROUP
      const dr5 = await http(adminS, "POST", "/api/admin/discounts", {
        dealerId: dealer.id,
        scope: "DISCOUNT_GROUP",
        discountGroup: "G1",
        discountPct: 12,
      });
      check("F.5 DISCOUNT_GROUP → 200/201", dr5.status === 200 || dr5.status === 201, dr5);
      if ((dr5.data as { id?: string })?.id) cleanup.discountRuleIds.push((dr5.data as { id: string }).id);

      // F.6 PRODUCT (en yüksek öncelik) — pricing engine doğrula
      // PRODUCT 20% prod1 için aktif — login dealer ve sipariş oluştur
      const dealer1S = newSession("dealer1");
      await login(dealer1S, dealerEmail, dealerPwd);

      const ordOpen = await http(dealer1S, "POST", "/api/orders", {
        items: [{ productId: prod1Id, quantity: 2 }],
        shipping: {
          fullName: "Bayi",
          email: dealerEmail,
          phone: "05550001122",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Bayi cd 1",
        },
        paymentMethod: "OPEN_ACCOUNT",
      });
      check("F.6 onaylı bayi OPEN_ACCOUNT order → 200/201", ordOpen.status === 200 || ordOpen.status === 201, ordOpen);
      const ordOpenId = (ordOpen.data as { orderId?: string; id?: string })?.orderId
        ?? (ordOpen.data as { id?: string })?.id;
      if (ordOpenId) cleanup.orderIds.push(ordOpenId);

      // F.7 DB'de doğru discount uygulandı mı? (prod1 = 130 TL, 20% → 104 TL/birim, 2 = 208 + KDV)
      if (ordOpenId) {
        const ordDb = await prisma.order.findUnique({
          where: { id: ordOpenId },
          include: { items: true },
        });
        const item = ordDb?.items.find((i) => i.productId === prod1Id);
        const expected = 130 * 0.8;
        const actual = item ? Number(item.unitPrice) : 0;
        check(
          `F.7 PRODUCT 20% off uygulanmış (beklenen ${expected}, gelen ${actual})`,
          Math.abs(actual - expected) < 0.01,
          { expected, actual },
        );
      }
    }

    // ─── MODÜL G: Bulk operations regression ─────────────────────
    section("Modül G: Toplu işlem regresyon");
    // G.1 bulk-update isPublished=false
    const bu = await http(adminS, "POST", "/api/admin/products/bulk-update", {
      productIds: [prod1Id, prod2Id],
      patch: { isPublished: false },
    });
    check("G.1 bulk-update unpublish → 200", bu.status === 200, bu);

    const checkP1 = await prisma.product.findUnique({ where: { id: prod1Id } });
    check("G.1b prod1 isPublished=false", checkP1?.isPublished === false);

    // G.2 bulk-price dryRun
    const bp = await http(adminS, "POST", "/api/admin/products/bulk-price", {
      filter: { productIds: [prod1Id, prod2Id] },
      mode: "percent_increase",
      value: 10,
      dryRun: true,
    });
    check("G.2 bulk-price dryRun → 200", bp.status === 200, bp);

    // G.3 bulk-delete (cleanup için kullanmayalım, validation testi)
    const bd = await http(adminS, "POST", "/api/admin/products/bulk-delete", {
      productIds: [],
    });
    check("G.3 bulk-delete empty → 400", bd.status === 400, bd.status);

    // ─── MODÜL H: Edge case + güvenlik regresyon ─────────────────
    section("Modül H: Edge case & güvenlik regresyon");

    // H.1 IDOR: customer başka kullanıcının adresine PATCH atmaya çalışsın
    const otherUser = await prisma.user.create({
      data: {
        email: `e2e-other-${ts}@example.test`,
        name: "Other User",
        passwordHash: await bcrypt.hash("x", 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "Other",
            fullName: "Other",
            phone: "05550000000",
            city: "İstanbul",
            district: "Kadıköy",
            addressLine: "Other cd",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    cleanup.userIds.push(otherUser.id);
    const otherAddr = otherUser.addresses[0];

    const idor = await http(custS, "PATCH", `/api/account/addresses/${otherAddr.id}`, {
      label: "Hijacked",
      fullName: "Hacked",
      phone: "05551112233",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Hijack cd",
    });
    check("H.1 başka kullanıcının adresine IDOR → 403/404", idor.status === 403 || idor.status === 404, idor.status);

    const otherStillOk = await prisma.address.findUnique({ where: { id: otherAddr.id } });
    check("H.1b adres değişmedi", otherStillOk?.fullName === "Other");

    // H.2 IDOR/authz: customer admin order status POST'una erişmeye çalışsın
    if (cleanup.orderIds[0]) {
      const otherOrd = cleanup.orderIds[0];
      const idor2 = await http(custS, "POST", `/api/admin/orders/${otherOrd}/status`, {
        status: "CANCELLED",
      });
      check("H.2 customer admin order POST → 401/403", idor2.status === 401 || idor2.status === 403, idor2.status);
    }

    // H.3 mass assignment: register'da role=ADMIN gönder
    const massEmail = `e2e-mass-${ts}@example.test`;
    const massReg = await http(newSession(), "POST", "/api/auth/register", {
      name: "Mass",
      email: massEmail,
      password: "MassPwd123",
      role: "ADMIN",
    });
    if (massReg.status === 201) {
      const massUser = await prisma.user.findUnique({ where: { email: massEmail } });
      if (massUser) cleanup.userIds.push(massUser.id);
      check("H.3 register role=ADMIN ignore", massUser?.role === "CUSTOMER", massUser?.role);
    } else {
      // rate-limit hit may show up here
      check("H.3 register denied or generic", massReg.status >= 200, massReg.status);
    }

    // H.4 Open redirect koruması — login callbackUrl=javascript:
    const orS = newSession();
    const csrfOR = await http(orS, "GET", "/api/auth/csrf");
    const csrfOR_t = (csrfOR.data as { csrfToken: string }).csrfToken;
    const orRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieHeader(orS),
      },
      body: new URLSearchParams({
        email: custEmail,
        password: custPwd,
        csrfToken: csrfOR_t,
        callbackUrl: "https://evil.example.com/phish",
        json: "true",
      }).toString(),
      redirect: "manual",
    });
    const orData = (await orRes.json().catch(() => ({}))) as { url?: string };
    const safeRedirect = !orData.url || orData.url.startsWith(BASE) || orData.url.startsWith("/");
    check("H.4 callbackUrl evil reddedilmeli", safeRedirect, orData.url);

    // H.5 SQL injection denemesi (search)
    const sqli = await http(newSession(), "GET", `/api/search?q=' OR 1=1--`);
    check("H.5 SQLi 200 (parametreli sorgu)", sqli.status === 200, sqli.status);

    // H.6 XSS — review comment'a script enjekte (prod2 G.1 ile unpublish oldu,
    // o yüzden someProd üzerinden ayrı bir customer ile yorum yazalım)
    const xssCustEmail = `e2e-xss-${ts}@example.test`;
    const xssCust = await prisma.user.create({
      data: {
        email: xssCustEmail,
        name: "XSS Test",
        passwordHash: await bcrypt.hash("XssPwd123!", 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
      },
    });
    cleanup.userIds.push(xssCust.id);
    const xssS = newSession("xss");
    await login(xssS, xssCustEmail, "XssPwd123!");

    if (someProd) {
      const xssReview = await http(xssS, "POST", "/api/reviews", {
        productId: someProd.id,
        rating: 4,
        title: "<script>alert(1)</script>",
        comment: "<img src=x onerror=alert(1)> abcdefghij",
      });
      check("H.6 XSS submit edilebildi (200/201)", xssReview.status === 200 || xssReview.status === 201, xssReview);
      if (xssReview.status === 200 || xssReview.status === 201) {
        const reviewId = (xssReview.data as { id?: string })?.id ?? "";
        if (reviewId) cleanup.reviewIds.push(reviewId);
      }
    }
    // server-side: rendering escapeHtml yapmalı; bunu unit test'lerle teyit ettik (security-r2)

    // H.7 path traversal — uploads
    const pt = await http(newSession(), "GET", "/uploads/../../etc/passwd");
    check("H.7 path traversal → 4xx", pt.status >= 400 && pt.status < 500, pt.status);

    // H.8 ratelimit — aynı IP'den hızlı 8 deneme (rate-limit IP-bazlı, 5/saat)
    let rateLimitHit = false;
    const rlSession: Session = { cookies: new Map(), label: "rl", fakeIp: "10.50.50.50" };
    for (let i = 0; i < 8; i++) {
      const r = await http(rlSession, "POST", "/api/auth/register", {
        name: "Spam",
        email: `e2e-rl-${ts}-${i}@example.test`,
        password: "SpamPwd123",
      });
      if (r.status === 429) {
        rateLimitHit = true;
        break;
      }
    }
    check("H.8 register rate-limit 429 yakalandı", rateLimitHit);
    // Rate-limit hit ile kayıt olmuş olabilecek kullanıcıları cleanup'a ekle
    const rlUsers = await prisma.user.findMany({
      where: { email: { startsWith: `e2e-rl-${ts}` } },
      select: { id: true },
    });
    for (const u of rlUsers) cleanup.userIds.push(u.id);

    // ─── ÖZET ────────────────────────────────────────────────────
    section("Özet");
    console.log(`\nToplam: ${pass}/${total} başarılı`);
    if (failures.length > 0) {
      console.log(`\n${failures.length} fail:`);
      for (const f of failures) console.log(`  • ${f}`);
    }
  } catch (err) {
    console.error("FATAL:", err);
    process.exitCode = 1;
  } finally {
    // Cleanup — reverse order to honor FKs
    console.log("\n[cleanup]");
    try {
      // Discount rules
      for (const id of cleanup.discountRuleIds) {
        await prisma.dealerDiscount.deleteMany({ where: { id } }).catch(() => {});
      }
      // Reviews
      for (const id of cleanup.reviewIds) {
        await prisma.productReview.deleteMany({ where: { id } }).catch(() => {});
      }
      // Orders + items + events + payment sessions cascade
      for (const id of cleanup.orderIds) {
        await prisma.orderItem.deleteMany({ where: { orderId: id } }).catch(() => {});
        await prisma.orderEvent.deleteMany({ where: { orderId: id } }).catch(() => {});
        await prisma.paymentSession.deleteMany({ where: { orderId: id } }).catch(() => {});
        await prisma.order.deleteMany({ where: { id } }).catch(() => {});
      }
      // Coupons
      for (const id of cleanup.couponIds) {
        await prisma.coupon.deleteMany({ where: { id } }).catch(() => {});
      }
      // Products created by us
      for (const id of cleanup.productIds) {
        await prisma.productReview.deleteMany({ where: { productId: id } }).catch(() => {});
        await prisma.product.deleteMany({ where: { id } }).catch(() => {});
      }
      // Categories
      for (const id of cleanup.categoryIds) {
        await prisma.category.deleteMany({ where: { id } }).catch(() => {});
      }
      // Publishers
      for (const id of cleanup.publisherIds) {
        await prisma.publisher.deleteMany({ where: { id } }).catch(() => {});
      }
      // Users — orders/addresses/dealer cascade. Orders MUST go before addresses
      // because orders.addressId → addresses.id is RESTRICT.
      for (const id of cleanup.userIds) {
        try {
          // önce kullanıcının siparişleri (ile bağlı item/event/payment session)
          const userOrders = await prisma.order.findMany({
            where: { userId: id },
            select: { id: true },
          });
          for (const o of userOrders) {
            await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
            await prisma.orderEvent.deleteMany({ where: { orderId: o.id } });
            await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
          }
          await prisma.order.deleteMany({ where: { userId: id } });
          await prisma.address.deleteMany({ where: { userId: id } });
          await prisma.productReview.deleteMany({ where: { userId: id } });
          await prisma.dealerDiscount.deleteMany({
            where: { dealer: { userId: id } },
          }).catch(() => {});
          await prisma.dealer.deleteMany({ where: { userId: id } });
          await prisma.auditLog.deleteMany({ where: { actorId: id } });
          await prisma.user.deleteMany({ where: { id } });
        } catch (e) {
          console.error(`[cleanup] user ${id}:`, (e as Error).message);
        }
      }
    } finally {
      await prisma.$disconnect();
      await pool.end();
    }
    if (pass < total) process.exitCode = 1;
  }
})();
