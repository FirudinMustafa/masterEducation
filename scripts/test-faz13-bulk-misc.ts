/**
 * Faz 13 dogrulama: kupon bulk-create + yorum bulk-status + kullanıcı bulk-delete
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const BASE = "http://localhost:3000";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const cookies = new Map<string, string>();
function applyCookies(h: Headers) {
  const all = h.getSetCookie?.() ?? [];
  for (const sc of all) {
    const [pair] = sc.split(";");
    const [k, ...v] = pair.split("=");
    cookies.set(k.trim(), v.join("=").trim());
  }
}
const cookieHeader = () =>
  Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");

async function loginAsAdmin(email: string, password: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  applyCookies(csrfRes.headers);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body: new URLSearchParams({
      email,
      password,
      csrfToken,
      callbackUrl: `${BASE}/admin`,
      json: "true",
    }).toString(),
    redirect: "manual",
  });
  applyCookies(r.headers);
}

(async () => {
  const ts = Date.now();
  let pass = 0,
    total = 0;
  const check = (n: string, c: boolean, x?: unknown) => {
    total++;
    if (c) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else console.log(`  ✗ ${n}`, x ?? "");
  };

  let adminId: string | null = null;
  let createdReviewIds: string[] = [];
  const createdUserIds: string[] = [];
  let custWithOrderId: string | null = null;
  const couponPattern = `FAZ13-${ts}-{NNN}`;

  try {
    const adminEmail = `faz13-admin-${ts}@example.test`;
    const adminPwd = "test1234";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz13 Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
    await loginAsAdmin(adminEmail, adminPwd);

    // ─── COUPON BULK CREATE ─────────────────────────────
    {
      const dryRes = await fetch(`${BASE}/api/admin/coupons/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          codeTemplate: couponPattern,
          startNumber: 1,
          count: 5,
          kind: "PERCENT",
          value: 15,
          minSubtotal: 100,
          maxUses: 1,
          dryRun: true,
        }),
      });
      const d = (await dryRes.json()) as {
        total: number;
        willCreate: number;
        applied: boolean;
        sample: string[];
      };
      check("dryRun applied=false", d.applied === false);
      check("dryRun total=5", d.total === 5);
      check("dryRun willCreate=5", d.willCreate === 5);
      check(
        "dryRun sample template OK",
        d.sample[0] === `FAZ13-${ts}-001` && d.sample[4] === `FAZ13-${ts}-005`
      );

      const ap = await fetch(`${BASE}/api/admin/coupons/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          codeTemplate: couponPattern,
          startNumber: 1,
          count: 5,
          kind: "PERCENT",
          value: 15,
          minSubtotal: 100,
          maxUses: 1,
        }),
      });
      const ad = (await ap.json()) as { created: number };
      check("apply created=5", ad.created === 5);

      const dbCoupons = await prisma.coupon.findMany({
        where: { code: { startsWith: `FAZ13-${ts}-` } },
        select: { code: true, kind: true, value: true },
      });
      check("DB: 5 kupon", dbCoupons.length === 5);
      check(
        "DB: hepsi PERCENT 15",
        dbCoupons.every((c) => c.kind === "PERCENT" && Number(c.value) === 15)
      );

      // Conflict: aynı pattern + aynı startNumber → tüm kodlar zaten var
      const conf = await fetch(`${BASE}/api/admin/coupons/bulk-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          codeTemplate: couponPattern,
          startNumber: 1,
          count: 5,
          kind: "PERCENT",
          value: 15,
        }),
      });
      check("aynı pattern → 409", conf.status === 409);
    }

    // ─── REVIEW BULK MODERATION ─────────────────────────
    const product = await prisma.product.findFirst({
      where: { isPublished: true },
      select: { id: true },
    });
    if (!product) throw new Error("urun yok");

    // Her review icin ayri kullanici (productId+userId unique constraint)
    for (let i = 0; i < 3; i++) {
      const reviewer = await prisma.user.create({
        data: {
          email: `faz13-rev-${ts}-${i}@example.test`,
          name: `Reviewer ${i}`,
          passwordHash: await bcrypt.hash("x", 10),
          role: "CUSTOMER",
          emailVerified: new Date(),
        },
      });
      createdUserIds.push(reviewer.id);
      const r = await prisma.productReview.create({
        data: {
          productId: product.id,
          userId: reviewer.id,
          rating: 5,
          title: `Faz13 Title ${i}`,
          comment: `Faz13 yorum ${i}`,
          status: "PENDING",
        },
      });
      createdReviewIds.push(r.id);
    }

    {
      const r = await fetch(`${BASE}/api/admin/reviews/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          reviewIds: createdReviewIds,
          action: "APPROVED",
        }),
      });
      const d = (await r.json()) as { affected: number };
      check("review bulk APPROVED 200", r.status === 200);
      check("affected=3", d.affected === 3);
    }
    const aReviews = await prisma.productReview.findMany({
      where: { id: { in: createdReviewIds } },
      select: { status: true },
    });
    check(
      "DB: hepsi APPROVED",
      aReviews.every((r) => r.status === "APPROVED")
    );

    // bulk REJECTED
    {
      const r = await fetch(`${BASE}/api/admin/reviews/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          reviewIds: createdReviewIds,
          action: "REJECTED",
        }),
      });
      const d = (await r.json()) as { affected: number };
      check("review bulk REJECTED 200", r.status === 200);
      check("affected=3 (reject)", d.affected === 3);
    }

    // bulk DELETE
    {
      const r = await fetch(`${BASE}/api/admin/reviews/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          reviewIds: createdReviewIds,
          action: "DELETE",
        }),
      });
      check("review bulk DELETE 200", r.status === 200);
      const remaining = await prisma.productReview.count({
        where: { id: { in: createdReviewIds } },
      });
      check("DB: tüm yorumlar silindi", remaining === 0);
      createdReviewIds = [];
    }

    // ─── USER BULK DELETE ───────────────────────────────
    // 3 siparişsiz CUSTOMER + 1 siparişli CUSTOMER + 1 onayli BAYI + 1 ADMIN deneme
    const noOrderUsers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({
        data: {
          email: `faz13-no-${ts}-${i}@example.test`,
          name: `No Order ${i}`,
          passwordHash: await bcrypt.hash("x", 10),
          role: "CUSTOMER",
          emailVerified: new Date(),
        },
      });
      noOrderUsers.push(u.id);
      createdUserIds.push(u.id);
    }

    // siparişli kullanici
    const cust2 = await prisma.user.create({
      data: {
        email: `faz13-with-${ts}@example.test`,
        name: "With Order",
        passwordHash: await bcrypt.hash("x", 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "X",
            fullName: "x",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "x",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    custWithOrderId = cust2.id;
    createdUserIds.push(cust2.id);

    const orderProduct = await prisma.product.findFirst({
      where: { isPublished: true },
      select: { id: true, name: true, sku: true, price: true },
    });
    if (!orderProduct) throw new Error("siparis ürünü yok");

    await prisma.order.create({
      data: {
        orderNumber: `FAZ13-O-${ts}`,
        userId: cust2.id,
        status: "DELIVERED",
        paymentMethod: "CREDIT_CARD",
        paymentStatus: "PAID",
        subtotal: 100,
        discountTotal: 0,
        vatTotal: 0,
        shippingCost: 0,
        total: 100,
        shippingName: "x",
        shippingPhone: "05551234567",
        shippingCity: "İstanbul",
        shippingAddress: "x",
        addressId: cust2.addresses[0].id,
        items: {
          create: {
            productId: orderProduct.id,
            productName: orderProduct.name,
            productSku: orderProduct.sku,
            quantity: 1,
            unitPrice: Number(orderProduct.price),
            discountPct: 0,
            vatRate: 0,
            vatAmount: 0,
            lineTotal: Number(orderProduct.price),
          },
        },
      },
    });

    // Onaylı bayi (silinmemeli)
    const approvedDealerUser = await prisma.user.create({
      data: {
        email: `faz13-dealer-${ts}@example.test`,
        name: "Dealer",
        passwordHash: await bcrypt.hash("x", 10),
        role: "DEALER",
        emailVerified: new Date(),
        dealer: {
          create: {
            companyName: `Dealer ${ts}`,
            taxOffice: "x",
            taxNumber: "1234567890",
            status: "APPROVED",
            paymentTerms: "OPEN_ACCOUNT",
            creditLimit: 1000,
            approvedAt: new Date(),
          },
        },
      },
    });
    createdUserIds.push(approvedDealerUser.id);

    // Bulk delete: noOrder + cust2 + approvedDealer + admin (kendisi)
    {
      const r = await fetch(`${BASE}/api/admin/users/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          userIds: [
            ...noOrderUsers,
            cust2.id,
            approvedDealerUser.id,
            admin.id, // self
          ],
          mode: "auto",
        }),
      });
      const d = (await r.json()) as {
        hardDeleted: number;
        anonymized: number;
        skipped: number;
        skippedSelf: number;
        skippedDetails: { reason: string }[];
      };
      check("bulk-delete 200", r.status === 200);
      check("hardDeleted=3 (siparişsiz)", d.hardDeleted === 3);
      check("anonymized=1 (siparişli)", d.anonymized === 1);
      check("skippedSelf=1", d.skippedSelf === 1);
      check(
        "approved dealer skipped",
        d.skippedDetails.some((s) => s.reason.includes("Onayli bayi"))
      );
    }

    // DB doğrulama: noOrder users hard deleted
    const remainingNoOrder = await prisma.user.count({
      where: { id: { in: noOrderUsers } },
    });
    check("DB: 3 siparişsiz silinmiş", remainingNoOrder === 0);
    // Siparişli olan anonimleştirildi (hâlâ var, ama email değişti)
    const cust2After = await prisma.user.findUnique({
      where: { id: cust2.id },
      select: { email: true, name: true },
    });
    check(
      "DB: siparişli kullanici anonim",
      cust2After?.email.startsWith("deleted-") === true &&
        cust2After.name === "Silinen Kullanici"
    );
    // Onaylı bayi hâlâ var
    const dealerStill = await prisma.user.findUnique({
      where: { id: approvedDealerUser.id },
    });
    check("DB: onaylı bayi atlandi", dealerStill !== null);

    // Audit
    const auditCount = await prisma.auditLog.count({
      where: {
        actorId: admin.id,
        action: { in: ["COUPON_BULK_CREATE", "REVIEW_BULK_STATUS", "USER_BULK_DELETE"] },
      },
    });
    check("Audit: en az 5 bulk kaydi", auditCount >= 5, `actual=${auditCount}`);

    // Cleanup
    await prisma.coupon.deleteMany({
      where: { code: { startsWith: `FAZ13-${ts}-` } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { userId: cust2.id } },
    });
    await prisma.order.deleteMany({ where: { userId: cust2.id } });
    for (const uid of createdUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    if (adminId) await prisma.user.delete({ where: { id: adminId } });

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    await prisma.coupon
      .deleteMany({ where: { code: { startsWith: `FAZ13-${ts}-` } } })
      .catch(() => {});
    if (createdReviewIds.length > 0)
      await prisma.productReview
        .deleteMany({ where: { id: { in: createdReviewIds } } })
        .catch(() => {});
    if (custWithOrderId) {
      await prisma.order
        .deleteMany({ where: { userId: custWithOrderId } })
        .catch(() => {});
    }
    for (const uid of createdUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    if (adminId)
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
