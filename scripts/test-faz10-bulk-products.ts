/**
 * Faz 10 dogrulama: ürün toplu işlemler (admin auth dahil).
 *
 *  1. Admin auth (cookie)
 *  2. Test için 5 ürün oluştur (sıfır state)
 *  3. POST /api/admin/products/bulk-update — KDV %18 → %20
 *  4. DB'den doğrula
 *  5. POST /api/admin/products/bulk-update — categoryId değiştir
 *  6. POST /api/admin/products/bulk-update — isPublished=false
 *  7. POST /api/admin/products/bulk-delete — 5 ürünü sil (sipariş yok → hard)
 *  8. Audit log kayıtları kontrolu
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
function cookieHeader() {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

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
  let createdIds: string[] = [];
  let pass = 0;
  let total = 0;
  const check = (name: string, cond: boolean, x?: unknown) => {
    total++;
    if (cond) {
      pass++;
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ✗ ${name}`, x ?? "");
    }
  };

  try {
    // 1) Test admin oluştur (geçici)
    const ts = Date.now();
    const adminEmail = `faz10-admin-${ts}@example.test`;
    const adminPassword = "test1234";
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz10 Admin",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    console.log("[1] Test admin created");

    await loginAsAdmin(adminEmail, adminPassword);
    const sesRes = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie: cookieHeader() },
    });
    const ses = (await sesRes.json()) as {
      user?: { role?: string };
    };
    check("session.role=ADMIN", ses.user?.role === "ADMIN");
    console.log("[2] Logged in as admin");

    // 2) 5 test ürünü oluştur
    const publisher = await prisma.publisher.findFirst({ select: { id: true } });
    if (!publisher) throw new Error("publisher yok");
    const created = await Promise.all(
      Array.from({ length: 5 }).map(async (_, i) =>
        prisma.product.create({
          data: {
            nopId: 9900000 + ts % 100000 + i,
            name: `Faz10 Test ${ts}-${i}`,
            slug: `faz10-test-${ts}-${i}`,
            sku: `FAZ10-${ts}-${i}`,
            price: 100,
            vatRate: 18,
            stockQuantity: 5,
            isPublished: true,
            publisherId: publisher.id,
          },
          select: { id: true },
        })
      )
    );
    createdIds = created.map((p) => p.id);
    console.log("[3] 5 test products created");

    // 3) Bulk update — KDV %18 → %20
    const r1 = await fetch(`${BASE}/api/admin/products/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ productIds: createdIds, patch: { vatRate: 20 } }),
    });
    const d1 = (await r1.json()) as { updated?: number; error?: string };
    check("bulk-update KDV → 200", r1.status === 200, d1);
    check("updated count = 5", d1.updated === 5);

    const after1 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { vatRate: true },
    });
    check(
      "DB: tum ürünler vatRate = 20",
      after1.every((p) => Number(p.vatRate) === 20)
    );

    // 4) Bulk update — fiyat = 250
    const r2 = await fetch(`${BASE}/api/admin/products/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ productIds: createdIds, patch: { price: 250 } }),
    });
    check("bulk-update fiyat → 200", r2.status === 200);
    const after2 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check(
      "DB: tum ürünler price = 250",
      after2.every((p) => Number(p.price) === 250)
    );

    // 5) Bulk update — isPublished=false
    const r3 = await fetch(`${BASE}/api/admin/products/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        productIds: createdIds,
        patch: { isPublished: false },
      }),
    });
    check("bulk-update isPublished=false → 200", r3.status === 200);
    const after3 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { isPublished: true },
    });
    check(
      "DB: hepsi yayindan kalkti",
      after3.every((p) => p.isPublished === false)
    );

    // 6) Validation: 0 ID → 400
    const r4 = await fetch(`${BASE}/api/admin/products/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ productIds: [], patch: { vatRate: 18 } }),
    });
    check("empty productIds → 400", r4.status === 400);

    // 7) Validation: bos patch → 400
    const r5 = await fetch(`${BASE}/api/admin/products/bulk-update`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ productIds: createdIds, patch: {} }),
    });
    check("empty patch → 400", r5.status === 400);

    // 8) Bulk delete
    const r6 = await fetch(`${BASE}/api/admin/products/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ productIds: createdIds }),
    });
    const d6 = (await r6.json()) as {
      hardDeleted?: number;
      softDeleted?: number;
    };
    check("bulk-delete → 200", r6.status === 200);
    check("hardDeleted = 5", d6.hardDeleted === 5);
    check("softDeleted = 0", d6.softDeleted === 0);

    const remaining = await prisma.product.count({
      where: { id: { in: createdIds } },
    });
    check("DB: tum ürünler hard-deleted", remaining === 0);
    createdIds = [];

    // 9) Audit log kayitlari kontrol
    const auditCount = await prisma.auditLog.count({
      where: {
        actorId: adminUser.id,
        action: { in: ["PRODUCT_BULK_UPDATE", "PRODUCT_BULK_DELETE"] },
      },
    });
    check(
      "Audit log: en az 4 bulk kaydi",
      auditCount >= 4,
      `actual=${auditCount}`
    );

    // Cleanup admin
    await prisma.user.delete({ where: { id: adminUser.id } });

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    if (createdIds.length > 0) {
      await prisma.product
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
