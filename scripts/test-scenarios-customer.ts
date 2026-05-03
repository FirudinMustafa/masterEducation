/**
 * BIREYSEL MUSTERI SENARYOLARI — end-to-end.
 * HTTP + DB karisim. NextAuth session cookie'si icin form-based login.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const BASE = "http://localhost:3000";

const TEST_EMAIL = "scenario-customer@mastereducation.com.tr";
const TEST_EMAIL_2 = "scenario-customer-2@mastereducation.com.tr";

let pass = 0, fail = 0;
const issues: string[] = [];
function check(name: string, cond: boolean, note?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}${note ? "  " + note : ""}`);
    fail++;
    issues.push(`CUSTOMER: ${name} ${note ?? ""}`);
  }
}

async function cleanup() {
  for (const e of [TEST_EMAIL, TEST_EMAIL_2]) {
    const u = await prisma.user.findUnique({ where: { email: e } });
    if (!u) continue;
    await prisma.emailVerificationToken.deleteMany({ where: { userId: u.id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: u.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
    const orders = await prisma.order.findMany({ where: { userId: u.id } });
    for (const o of orders) {
      await prisma.auditLog.deleteMany({ where: { entityId: o.id } });
      await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
      await prisma.couponRedemption.deleteMany({ where: { orderId: o.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    await prisma.cartItem.deleteMany({ where: { userId: u.id } });
    await prisma.address.deleteMany({ where: { userId: u.id } });
    await prisma.productReview.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

async function req(path: string, init?: RequestInit & { cookies?: string }) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.cookies) headers["Cookie"] = init.cookies;
  const res = await fetch(BASE + path, {
    ...init,
    headers,
    redirect: "manual",
  });
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    json: (() => {
      try { return JSON.parse(text); } catch { return null; }
    })(),
    setCookies: res.headers.getSetCookie(),
  };
}

async function loginForSession(email: string, password: string) {
  const csrfRes = await req("/api/auth/csrf");
  const csrfToken = csrfRes.json?.csrfToken;
  const cookieJar = csrfRes.setCookies.map((c) => c.split(";")[0]).join("; ");
  if (!csrfToken) throw new Error("csrf token missing");

  const params = new URLSearchParams({
    email,
    password,
    csrfToken,
    json: "true",
  });
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieJar,
    },
    body: params.toString(),
    redirect: "manual",
  });
  const allCookies = [
    ...csrfRes.setCookies,
    ...loginRes.headers.getSetCookie(),
  ]
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("="))
    .join("; ");
  return allCookies;
}

(async () => {
  console.log("\n=== CUSTOMER SCENARIOS ===\n");
  await cleanup();

  // ============ BOLUM A: PUBLIC PAGES ============
  console.log("\n── A) Public sayfalar ──");
  for (const [label, path] of [
    ["anasayfa", "/"],
    ["/urunler", "/urunler"],
    ["/urunler arama", "/urunler?ara=english"],
    ["/urunler publisher filter", "/urunler?yayinevi=express"],
    ["/urunler indirim filter", "/urunler?indirim=1"],
    ["/urunler minPrice filter", "/urunler?min=50"],
    ["/kategoriler/elt", "/kategoriler/elt"],
    ["/yayinevleri/express", "/yayinevleri/express"],
    ["/sepet", "/sepet"],
    ["/favoriler", "/favoriler"],
    ["/karsilastir", "/karsilastir"],
    ["/iletisim", "/iletisim"],
    ["/hakkimizda", "/hakkimizda"],
    ["/kvkk", "/kvkk"],
    ["/iade", "/iade"],
    ["/sss", "/sss"],
    ["/giris", "/giris"],
    ["/kayit", "/kayit"],
    ["/sifremi-unuttum", "/sifremi-unuttum"],
    ["/sifre-sifirla", "/sifre-sifirla"],
    ["/siparis-takip", "/siparis-takip"],
    ["/bayi-basvuru", "/bayi-basvuru"],
    ["/robots.txt", "/robots.txt"],
    ["/sitemap.xml", "/sitemap.xml"],
  ] as const) {
    const r = await req(path);
    check(`${label} -> 200`, r.status === 200, `got ${r.status}`);
  }

  // Urun detay ve 404 kontrolu
  const pub = await prisma.product.findFirst({ where: { isPublished: true }, select: { slug: true } });
  const hidden = await prisma.product.findFirst({ where: { isPublished: false }, select: { slug: true } });
  if (pub) {
    const r = await req(`/urunler/${pub.slug}`);
    check(`Yayindaki urun detay -> 200`, r.status === 200);
    check(`Urun detay'da JSON-LD geciyor`, r.text.includes("application/ld+json"));
  }
  if (hidden) {
    const r = await req(`/urunler/${hidden.slug}`);
    check(`Gizli urun detay -> 404`, r.status === 404, `got ${r.status}`);
  }
  const nonExistent = await req(`/urunler/non-existent-slug-xyz`);
  check(`Olmayan slug -> 404`, nonExistent.status === 404);

  // ============ BOLUM B: REGISTRATION ============
  console.log("\n── B) Kayit akisi ──");

  // Zayif sifre reddedilir
  const weakReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Test User",
      email: TEST_EMAIL,
      password: "weak",
    }),
  });
  check(`Zayif sifre reddedilir (400)`, weakReg.status === 400);

  // Gecerli kayit
  const okReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Test User",
      email: TEST_EMAIL,
      phone: "05551112233",
      password: "GoodPass123",
    }),
  });
  check(`Gecerli kayit -> 201`, okReg.status === 201, `got ${okReg.status}`);

  // Ayni email tekrar -> 409
  const dupReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Dup",
      email: TEST_EMAIL,
      password: "GoodPass123",
    }),
  });
  check(`Duplicate email -> 409`, dupReg.status === 409);

  // Email verification token olustu mu
  const u1 = await prisma.user.findUnique({ where: { email: TEST_EMAIL }, include: { _count: { select: { orders: true } } } });
  const verifyTok = await prisma.emailVerificationToken.findFirst({ where: { userId: u1?.id } });
  check(`Kayit sonrasi verification token`, verifyTok !== null);
  check(`User emailVerified=null`, u1?.emailVerified === null);

  // Invalid token -> 400
  const badVerify = await req("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token: "x".repeat(64) }),
  });
  check(`Gecersiz verify token -> 400`, badVerify.status === 400);

  // Valid token -> 200
  if (verifyTok) {
    const okVerify = await req("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verifyTok.token }),
    });
    check(`Gecerli verify token -> 200`, okVerify.status === 200, `got ${okVerify.status}`);
    const u1b = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    check(`emailVerified set`, u1b?.emailVerified !== null);
  }

  // ============ BOLUM C: LOGIN ============
  console.log("\n── C) Login akisi ──");
  let cookies = "";
  try {
    cookies = await loginForSession(TEST_EMAIL, "GoodPass123");
    const hasSession = cookies.includes("session-token") || cookies.includes("authjs");
    check(`Login cookie uretildi`, hasSession, cookies.slice(0, 80));
  } catch (e) {
    check(`Login cookie uretildi`, false, String(e));
  }

  // Login'li kullanicinin hesabim'a erisimi
  if (cookies) {
    const r = await req("/hesabim", { cookies });
    check(`Login'li /hesabim -> 200`, r.status === 200, `got ${r.status}`);
  }

  // Yetkisiz hesabim -> redirect
  const noAuthHesabim = await req("/hesabim");
  check(`Yetkisiz /hesabim -> redirect`, [307, 302, 303].includes(noAuthHesabim.status));

  // ============ BOLUM D: PROFIL & SIFRE ============
  console.log("\n── D) Profil ve sifre ──");
  if (cookies) {
    const r = await req("/hesabim/profil", { cookies });
    check(`/hesabim/profil -> 200`, r.status === 200);

    // Profil duzenle
    const patchOk = await req("/api/account/profile", {
      method: "PATCH",
      cookies,
      body: JSON.stringify({
        name: "Test User Updated",
        email: TEST_EMAIL,
        phone: "05559998877",
      }),
    });
    check(`Profil guncelleme -> 200`, patchOk.status === 200, `got ${patchOk.status}`);

    // Yanlis current password
    const wrongPwd = await req("/api/account/change-password", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        currentPassword: "WrongPass123",
        newPassword: "NewPass123ABC",
      }),
    });
    check(`Yanlis mevcut sifre -> 403`, wrongPwd.status === 403, `got ${wrongPwd.status}`);

    // Dogru current password
    const okPwd = await req("/api/account/change-password", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        currentPassword: "GoodPass123",
        newPassword: "NewPass123ABC",
      }),
    });
    check(`Sifre degistirme -> 200`, okPwd.status === 200, `got ${okPwd.status}`);

    // Ayni sifre (current==new) reddedilir
    const samePwd = await req("/api/account/change-password", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        currentPassword: "NewPass123ABC",
        newPassword: "NewPass123ABC",
      }),
    });
    check(`Ayni sifre -> 400`, samePwd.status === 400);
  }

  // ============ BOLUM E: SIFRE RESET ============
  console.log("\n── E) Sifre sifirlama ──");
  const forgot = await req("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL }),
  });
  check(`Forgot password -> 200`, forgot.status === 200);
  // Gecersiz email de 200 (hesap enum leak korumasi)
  const forgotNonexistent = await req("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "nonexistent@example.com" }),
  });
  check(`Forgot nonexistent -> 200 (leak koruma)`, forgotNonexistent.status === 200);

  const rstTok = await prisma.passwordResetToken.findFirst({
    where: { userId: u1?.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  check(`Reset token yayinlandi`, rstTok !== null);

  if (rstTok) {
    const reset = await req("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: rstTok.token, password: "NewPass456XYZ" }),
    });
    check(`Reset password -> 200`, reset.status === 200);
    // Ayni token tekrar kullanilamaz
    const reset2 = await req("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: rstTok.token, password: "Another789" }),
    });
    check(`Kullanilmis token -> 400`, reset2.status === 400);
  }

  // ============ BOLUM F: SEPET + ODEME ============
  console.log("\n── F) Sepet + Siparis (mock odeme) ──");
  // Login tekrar (sifre degisti)
  cookies = await loginForSession(TEST_EMAIL, "NewPass456XYZ");

  const buyable = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 2 }, price: { gt: 0 } },
  });
  if (!buyable) {
    check(`Test urunu var`, false);
    await cleanup();
    process.exit(1);
  }

  // /api/cart/refresh
  const cartRefresh = await req("/api/cart/refresh", {
    method: "POST",
    cookies,
    body: JSON.stringify({
      items: [{ productId: buyable.id, quantity: 1 }],
    }),
  });
  check(`Cart refresh -> 200`, cartRefresh.status === 200);
  check(`Cart refresh urunu doner`, cartRefresh.json?.items?.length === 1);

  // /api/coupons/validate (kupon yok)
  const cv = await req("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code: "NONEXISTENT", subtotal: 100, shippingCost: 0 }),
  });
  check(`Gecersiz kupon -> 400`, cv.status === 400);

  // Siparis olustur (CREDIT_CARD, valid card)
  const orderPayload = {
    items: [{ productId: buyable.id, quantity: 1 }],
    shipping: {
      fullName: "Test User",
      email: TEST_EMAIL,
      phone: "05551112233",
      city: "Istanbul",
      district: "Kadikoy",
      postalCode: "34710",
      address: "Ornek Mah. Test Cad. No:1",
    },
    paymentMethod: "CREDIT_CARD",
    card: {
      number: "4111111111111111", // valid Luhn test card (Visa)
      expiry: "12/30",
      cvv: "123",
      holderName: "TEST USER",
    },
  };
  const orderRes = await req("/api/orders", {
    method: "POST",
    cookies,
    body: JSON.stringify(orderPayload),
  });
  check(`Siparis olustu -> 200`, orderRes.status === 200, `got ${orderRes.status} ${orderRes.text.slice(0, 200)}`);
  const paymentToken = orderRes.json?.paymentUrl?.split("/").pop();
  check(`Payment token uretildi`, !!paymentToken);

  // Luhn invalid
  const badCard = await req("/api/orders", {
    method: "POST",
    cookies,
    body: JSON.stringify({
      ...orderPayload,
      card: { ...orderPayload.card, number: "4111111111111112" }, // Luhn fail
    }),
  });
  check(`Luhn fail -> 400`, badCard.status === 400);

  // 3DS onay (gecersiz OTP)
  if (paymentToken) {
    const badOtp = await req("/api/payments/mock/confirm", {
      method: "POST",
      body: JSON.stringify({ token: paymentToken, action: "success", otp: "000000" }),
    });
    check(`Yanlis OTP -> 400`, badOtp.status === 400);

    const okOtp = await req("/api/payments/mock/confirm", {
      method: "POST",
      body: JSON.stringify({ token: paymentToken, action: "success", otp: "123456" }),
    });
    check(`Dogru OTP -> 200`, okOtp.status === 200, `got ${okOtp.status}`);

    // Ayni token tekrar -> 409
    const replay = await req("/api/payments/mock/confirm", {
      method: "POST",
      body: JSON.stringify({ token: paymentToken, action: "success", otp: "123456" }),
    });
    check(`Replay -> 409`, replay.status === 409);
  }

  // ============ BOLUM G: SIPARIS TAKIP + KARGO ============
  console.log("\n── G) Siparis takibi ──");
  const myOrder = await prisma.order.findFirst({
    where: { user: { email: TEST_EMAIL } },
    orderBy: { createdAt: "desc" },
  });
  check(`Siparis DB'de var`, myOrder !== null);

  if (myOrder) {
    // /siparis-takip
    const track = await req(`/siparis-takip?no=${myOrder.orderNumber}&email=${TEST_EMAIL}`);
    check(`Siparis takip -> 200`, track.status === 200);
    check(`Takipte siparis no geciyor`, track.text.includes(myOrder.orderNumber));
  }

  // ============ BOLUM H: ILETISIM FORM ============
  console.log("\n── H) Iletisim formu ──");
  const contactOk = await req("/api/contact", {
    method: "POST",
    body: JSON.stringify({
      name: "Test",
      email: "visitor@example.com",
      subject: "Deneme",
      message: "Bu bir test mesajidir.",
    }),
  });
  check(`Iletisim form -> 200`, contactOk.status === 200);

  // ============ BOLUM I: GUEST→USER UPGRADE ============
  console.log("\n── I) Guest → User upgrade ──");
  // Guest siparis simulasyonu: yeni email ile siparis ver (loginsiz)
  const guestPayload = {
    items: [{ productId: buyable.id, quantity: 1 }],
    shipping: {
      fullName: "Guest User",
      email: TEST_EMAIL_2,
      phone: "05551119988",
      city: "Istanbul",
      district: "Sisli",
      postalCode: "34380",
      address: "Test mah guest cad",
    },
    paymentMethod: "CREDIT_CARD",
    card: {
      number: "4111111111111111",
      expiry: "12/30",
      cvv: "123",
      holderName: "GUEST",
    },
  };
  const guestOrder = await req("/api/orders", {
    method: "POST",
    body: JSON.stringify(guestPayload),
  });
  check(`Guest siparis -> 200`, guestOrder.status === 200, `got ${guestOrder.status}`);
  // Guest siparisi OTP onayla
  const guestPaymentToken = guestOrder.json?.paymentUrl?.split("/").pop();
  if (guestPaymentToken) {
    await req("/api/payments/mock/confirm", {
      method: "POST",
      body: JSON.stringify({ token: guestPaymentToken, action: "success", otp: "123456" }),
    });
  }

  // Simdi ayni email ile register — upgrade olmali
  const upgradeReg = await req("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "Upgraded User",
      email: TEST_EMAIL_2,
      password: "GoodPass123",
    }),
  });
  check(`Guest user upgrade -> 201`, upgradeReg.status === 201, `got ${upgradeReg.status}`);
  const upgraded = await prisma.user.findUnique({
    where: { email: TEST_EMAIL_2 },
    include: { _count: { select: { orders: true } } },
  });
  check(`Upgraded user order'ini tasiyor`, (upgraded?._count.orders ?? 0) >= 1);

  // ============ BOLUM J: HESAP SIL ============
  console.log("\n── J) Hesap silme (KVKK) ──");
  // Login
  cookies = await loginForSession(TEST_EMAIL, "NewPass456XYZ");
  // Yanlis sifre
  const deleteWrong = await req("/api/account/delete", {
    method: "POST",
    cookies,
    body: JSON.stringify({ password: "WrongPass", confirm: "HESABIMI SIL" }),
  });
  check(`Hesap sil yanlis sifre -> 403`, deleteWrong.status === 403);
  // Confirm yanlis
  const deleteWrongConfirm = await req("/api/account/delete", {
    method: "POST",
    cookies,
    body: JSON.stringify({ password: "NewPass456XYZ", confirm: "YANLIS" }),
  });
  check(`Confirm yanlis -> 400`, deleteWrongConfirm.status === 400);
  // Dogru
  const deleteOk = await req("/api/account/delete", {
    method: "POST",
    cookies,
    body: JSON.stringify({ password: "NewPass456XYZ", confirm: "HESABIMI SIL" }),
  });
  check(`Hesap sil dogru -> 200`, deleteOk.status === 200, `got ${deleteOk.status} strategy=${deleteOk.json?.strategy}`);
  // Anonymize sonrasi email degistigi icin artik TEST_EMAIL ile bulunmaz —
  // onun yerine audit log + user_id ile kontrol edelim.
  const userIdForCheck = u1?.id;
  const afterDelete = userIdForCheck
    ? await prisma.user.findUnique({ where: { id: userIdForCheck } })
    : null;
  check(`Siparisli user anonimized (hala DB'de)`, afterDelete !== null);
  check(`Email anonimlesti`, !afterDelete || afterDelete.email.endsWith("@example.invalid"));
  check(`Name degisti`, !afterDelete || afterDelete.name === "Silinen Kullanici");

  // ============ RAPOR ============
  console.log(`\n=== SONUC: ${pass} basarili, ${fail} basarisiz ===\n`);
  if (fail > 0) {
    console.log("Sorunlar:");
    issues.forEach((i) => console.log(`  - ${i}`));
  }

  await cleanup();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
})();
