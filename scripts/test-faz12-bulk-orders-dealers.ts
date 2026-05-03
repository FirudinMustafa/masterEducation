/**
 * Faz 12 dogrulama: orders/bulk-status, dealers/bulk-approve, dealers/bulk-adjust-credit
 *
 *  ORDERS:
 *   - 3 PENDING sipariş oluştur
 *   - bulk-status APPROVED + adminNote → succeeded=3
 *   - DB doğrulama: status, OrderEvent kaydı
 *   - bulk-status SHIPPED + carrier=ARAS + ETA → succeeded=3
 *   - validation: empty body → 400
 *
 *  DEALERS APPROVE:
 *   - 3 PENDING + 1 APPROVED bayi
 *   - bulk-approve OPEN_ACCOUNT 5000 → approved=3, skipped=1
 *   - DB: 3 yeni APPROVED + paymentTerms + creditLimit
 *
 *  CREDIT ADJUST:
 *   - 3 onaylı + cari bayi (limitleri 1000/2000/3000)
 *   - dryRun percent_increase 50 → affected=3, sample
 *   - apply set 5000 → hepsi 5000
 *   - PREPAID + APPROVED bayi etkilenmez
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

  let createdOrderIds: string[] = [];
  let createdDealerUserIds: string[] = [];
  let adminId: string | null = null;
  let custId: string | null = null;

  try {
    const adminEmail = `faz12-admin-${ts}@example.test`;
    const adminPwd = "test1234";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz12 Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
    await loginAsAdmin(adminEmail, adminPwd);

    // ─── ORDERS ─────────────────────────────────────────
    const product = await prisma.product.findFirst({
      where: { isPublished: true, stockQuantity: { gt: 10 } },
      select: { id: true, sku: true, name: true, price: true, vatRate: true },
    });
    if (!product) throw new Error("uygun urun yok");

    const cust = await prisma.user.create({
      data: {
        email: `faz12-cust-${ts}@example.test`,
        name: "Faz12 Customer",
        passwordHash: await bcrypt.hash("x", 10),
        role: "CUSTOMER",
        emailVerified: new Date(),
        addresses: {
          create: {
            label: "Ev",
            fullName: "Faz12 Customer",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test cd 1",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    custId = cust.id;
    const addr = cust.addresses[0];

    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          orderNumber: `FAZ12-${ts}-${i}`,
          userId: cust.id,
          status: "PENDING",
          paymentMethod: "CREDIT_CARD",
          paymentStatus: "PAID",
          subtotal: Number(product.price),
          discountTotal: 0,
          vatTotal: 0,
          shippingCost: 0,
          total: Number(product.price),
          shippingName: cust.name,
          shippingPhone: "05551234567",
          shippingCity: "İstanbul",
          shippingAddress: "Test cd 1",
          addressId: addr.id,
          items: {
            create: {
              productId: product.id,
              productName: product.name,
              productSku: product.sku,
              quantity: 1,
              unitPrice: Number(product.price),
              discountPct: 0,
              vatRate: Number(product.vatRate),
              vatAmount: 0,
              lineTotal: Number(product.price),
            },
          },
        },
      });
      createdOrderIds.push(order.id);
    }
    console.log(`[orders] 3 PENDING order created`);

    // bulk-status APPROVED + adminNote
    {
      const r = await fetch(`${BASE}/api/admin/orders/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          orderIds: createdOrderIds,
          status: "APPROVED",
          adminNote: "Toplu onay",
        }),
      });
      const d = (await r.json()) as { succeeded: number; total: number };
      check("bulk-status APPROVED 200", r.status === 200);
      check("succeeded=3", d.succeeded === 3);
    }
    const after1 = await prisma.order.findMany({
      where: { id: { in: createdOrderIds } },
      select: { status: true },
    });
    check("DB: hepsi APPROVED", after1.every((o) => o.status === "APPROVED"));

    const events = await prisma.orderEvent.findMany({
      where: { orderId: { in: createdOrderIds }, type: "APPROVED" },
    });
    check("OrderEvent: 3 APPROVED kaydi", events.length === 3);

    // bulk-status SHIPPED + carrier
    {
      const r = await fetch(`${BASE}/api/admin/orders/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          orderIds: createdOrderIds,
          status: "SHIPPED",
          trackingCarrier: "ARAS",
          estimatedDeliveryAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        }),
      });
      const d = (await r.json()) as { succeeded: number };
      check("bulk-status SHIPPED 200", r.status === 200);
      check("succeeded=3 (shipped)", d.succeeded === 3);
    }
    const after2 = await prisma.order.findMany({
      where: { id: { in: createdOrderIds } },
      select: { status: true, trackingCarrier: true, estimatedDeliveryAt: true },
    });
    check("DB: hepsi SHIPPED", after2.every((o) => o.status === "SHIPPED"));
    check(
      "DB: hepsinde carrier=ARAS",
      after2.every((o) => o.trackingCarrier === "ARAS")
    );

    // empty body
    {
      const r = await fetch(`${BASE}/api/admin/orders/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({ orderIds: createdOrderIds }),
      });
      check("empty body → 400", r.status === 400);
    }

    // ─── DEALERS APPROVE ─────────────────────────────────
    const pendingDealers: string[] = [];
    let approvedDealerId = "";
    for (let i = 0; i < 3; i++) {
      const u = await prisma.user.create({
        data: {
          email: `faz12-pending-${ts}-${i}@example.test`,
          name: `Pending ${i}`,
          passwordHash: await bcrypt.hash("x", 10),
          role: "DEALER",
          emailVerified: new Date(),
          dealer: {
            create: {
              companyName: `PendingCo ${ts}-${i}`,
              taxOffice: "X",
              taxNumber: "1234567890",
              status: "PENDING",
              paymentTerms: "OPEN_ACCOUNT",
              creditLimit: 0,
            },
          },
        },
        include: { dealer: true },
      });
      createdDealerUserIds.push(u.id);
      pendingDealers.push(u.dealer!.id);
    }
    {
      const u = await prisma.user.create({
        data: {
          email: `faz12-approved-${ts}@example.test`,
          name: "Already Approved",
          passwordHash: await bcrypt.hash("x", 10),
          role: "DEALER",
          emailVerified: new Date(),
          dealer: {
            create: {
              companyName: `ApprovedCo ${ts}`,
              taxOffice: "X",
              taxNumber: "1234567890",
              status: "APPROVED",
              paymentTerms: "OPEN_ACCOUNT",
              creditLimit: 1000,
              approvedAt: new Date(),
            },
          },
        },
        include: { dealer: true },
      });
      createdDealerUserIds.push(u.id);
      approvedDealerId = u.dealer!.id;
    }

    {
      const r = await fetch(`${BASE}/api/admin/dealers/bulk-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader() },
        body: JSON.stringify({
          dealerIds: [...pendingDealers, approvedDealerId],
          paymentTerms: "OPEN_ACCOUNT",
          creditLimit: 5000,
          notes: "Toplu onay testi",
        }),
      });
      const d = (await r.json()) as { approved: number; skipped: number };
      check("bulk-approve 200", r.status === 200);
      check("approved=3", d.approved === 3);
      check("skipped=1", d.skipped === 1);
    }

    const aDealers = await prisma.dealer.findMany({
      where: { id: { in: pendingDealers } },
      select: { status: true, creditLimit: true, paymentTerms: true },
    });
    check(
      "DB: 3 bayi APPROVED + 5000 + OPEN_ACCOUNT",
      aDealers.every(
        (d) =>
          d.status === "APPROVED" &&
          Number(d.creditLimit) === 5000 &&
          d.paymentTerms === "OPEN_ACCOUNT"
      )
    );

    // ─── CREDIT ADJUST ────────────────────────────────────
    // pendingDealers şu an APPROVED + cari + 5000.
    // dryRun: percent_increase 50 → 7500
    {
      const r = await fetch(
        `${BASE}/api/admin/dealers/bulk-adjust-credit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: cookieHeader(),
          },
          body: JSON.stringify({
            dealerIds: pendingDealers,
            mode: "percent_increase",
            value: 50,
            dryRun: true,
          }),
        }
      );
      const d = (await r.json()) as {
        affected: number;
        applied: boolean;
        sample: { current: number; next: number }[];
      };
      check("dryRun percent +50: applied=false", d.applied === false);
      check("dryRun affected=3", d.affected === 3);
      check(
        "dryRun next=7500",
        d.sample.every((s) => s.next === 7500)
      );
    }
    // apply set 8000
    {
      const r = await fetch(
        `${BASE}/api/admin/dealers/bulk-adjust-credit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: cookieHeader(),
          },
          body: JSON.stringify({
            dealerIds: pendingDealers,
            mode: "set",
            value: 8000,
          }),
        }
      );
      const d = (await r.json()) as { affected: number; applied: boolean };
      check("apply set: applied=true", d.applied === true);
      check("affected=3", d.affected === 3);
    }
    const aLimits = await prisma.dealer.findMany({
      where: { id: { in: pendingDealers } },
      select: { creditLimit: true },
    });
    check(
      "DB: hepsi 8000",
      aLimits.every((d) => Number(d.creditLimit) === 8000)
    );

    // PREPAID dealer ekle ve test et
    const prepaidUser = await prisma.user.create({
      data: {
        email: `faz12-prep-${ts}@example.test`,
        name: "Prepaid",
        passwordHash: await bcrypt.hash("x", 10),
        role: "DEALER",
        emailVerified: new Date(),
        dealer: {
          create: {
            companyName: `PrepCo ${ts}`,
            taxOffice: "X",
            taxNumber: "1234567890",
            status: "APPROVED",
            paymentTerms: "PREPAID",
            creditLimit: 0,
            approvedAt: new Date(),
          },
        },
      },
      include: { dealer: true },
    });
    createdDealerUserIds.push(prepaidUser.id);
    {
      const r = await fetch(
        `${BASE}/api/admin/dealers/bulk-adjust-credit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: cookieHeader(),
          },
          body: JSON.stringify({
            dealerIds: [prepaidUser.dealer!.id],
            mode: "set",
            value: 99999,
          }),
        }
      );
      const d = (await r.json()) as { affected: number };
      check("PREPAID dealer skip → affected=0", d.affected === 0);
    }

    // Audit
    const auditCount = await prisma.auditLog.count({
      where: {
        actorId: admin.id,
        action: {
          in: [
            "ORDER_BULK_STATUS_CHANGE",
            "DEALER_BULK_APPROVE",
            "DEALER_BULK_CREDIT_ADJUST",
          ],
        },
      },
    });
    check(
      "Audit: en az 4 bulk kaydi",
      auditCount >= 4,
      `actual=${auditCount}`
    );

    // Cleanup
    await prisma.orderEvent.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    createdOrderIds = [];
    if (custId) await prisma.user.delete({ where: { id: custId } });
    custId = null;
    for (const uid of createdDealerUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    createdDealerUserIds = [];
    if (adminId) await prisma.user.delete({ where: { id: adminId } });
    adminId = null;

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    if (createdOrderIds.length > 0)
      await prisma.order
        .deleteMany({ where: { id: { in: createdOrderIds } } })
        .catch(() => {});
    if (custId) await prisma.user.delete({ where: { id: custId } }).catch(() => {});
    for (const uid of createdDealerUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    if (adminId) await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
