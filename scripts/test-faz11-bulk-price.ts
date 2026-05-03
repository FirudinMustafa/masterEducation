/**
 * Faz 11 dogrulama: filtreli toplu fiyat update.
 *
 *  1. Admin login
 *  2. Test publisher + 5 ürün oluştur (50/100/150/200/250 TL)
 *  3. dryRun=true preview → 5 ürün etkilenecek, summary kontrol
 *  4. mode=set value=100 → hepsi 100 TL
 *  5. mode=percent_increase value=20 → hepsi 120 TL
 *  6. mode=percent_decrease value=10 → hepsi 108 TL
 *  7. mode=fixed_increase value=15 → hepsi 123 TL
 *  8. minPrice floor → percent_decrease 90% min=100 → hepsi 100 (alt taban)
 *  9. Filter eksik (boş filter) → 400
 *  10. Cleanup
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
  let pubId: string | null = null;
  let createdIds: string[] = [];
  let pass = 0;
  let total = 0;
  const check = (n: string, c: boolean, x?: unknown) => {
    total++;
    if (c) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else {
      console.log(`  ✗ ${n}`, x ?? "");
    }
  };

  try {
    const ts = Date.now();
    const adminEmail = `faz11-admin-${ts}@example.test`;
    const adminPassword = "test1234";
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz11 Admin",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    await loginAsAdmin(adminEmail, adminPassword);

    // Test publisher (yalniz bizim 5 urunu icerecek)
    const pub = await prisma.publisher.create({
      data: { name: `Faz11 Yayinevi ${ts}`, slug: `faz11-pub-${ts}` },
    });
    pubId = pub.id;
    const prices = [50, 100, 150, 200, 250];
    for (let i = 0; i < prices.length; i++) {
      const p = await prisma.product.create({
        data: {
          nopId: 9810000 + (ts % 10000) + i,
          name: `Faz11 Test ${ts}-${i}`,
          slug: `faz11-test-${ts}-${i}`,
          sku: `FAZ11-${ts}-${i}`,
          price: prices[i],
          vatRate: 20,
          stockQuantity: 5,
          isPublished: true,
          publisherId: pub.id,
        },
        select: { id: true },
      });
      createdIds.push(p.id);
    }
    console.log(`[setup] 1 publisher + 5 product created`);

    // dryRun
    const dryRes = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "set",
        value: 999,
        dryRun: true,
      }),
    });
    const dryData = (await dryRes.json()) as {
      affected: number;
      applied: boolean;
      sample: { current: number; next: number }[];
      summary?: { minNew: number; maxNew: number };
    };
    check("dryRun applied=false", dryData.applied === false);
    check("dryRun affected=5", dryData.affected === 5);
    check("dryRun sample.next=999", dryData.sample.every((s) => s.next === 999));
    check(
      "DB henüz değişmedi",
      (await prisma.product.findFirst({
        where: { id: createdIds[0] },
        select: { price: true },
      }))?.price.toString() === "50"
    );

    // mode=set value=100
    const r1 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "set",
        value: 100,
      }),
    });
    const d1 = (await r1.json()) as { affected: number; applied: boolean };
    check("set apply 200", r1.status === 200);
    check("set applied=true", d1.applied === true);
    const after1 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check("DB: hepsi 100", after1.every((p) => Number(p.price) === 100));

    // mode=percent_increase 20
    const r2 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "percent_increase",
        value: 20,
      }),
    });
    check("percent_increase apply 200", r2.status === 200);
    const after2 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check("DB: hepsi 120", after2.every((p) => Number(p.price) === 120));

    // mode=percent_decrease 10 → 108
    const r3 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "percent_decrease",
        value: 10,
      }),
    });
    check("percent_decrease apply 200", r3.status === 200);
    const after3 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check("DB: hepsi 108", after3.every((p) => Number(p.price) === 108));

    // mode=fixed_increase 15 → 123
    const r4 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "fixed_increase",
        value: 15,
      }),
    });
    check("fixed_increase apply 200", r4.status === 200);
    const after4 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check("DB: hepsi 123", after4.every((p) => Number(p.price) === 123));

    // minPrice floor: percent_decrease 90 from 123 → 12.3 ama min 100 → 100
    const r5 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({
        filter: { publisherId: pub.id },
        mode: "percent_decrease",
        value: 90,
        minPrice: 100,
      }),
    });
    check("minPrice floor apply 200", r5.status === 200);
    const after5 = await prisma.product.findMany({
      where: { id: { in: createdIds } },
      select: { price: true },
    });
    check(
      "DB: minPrice floor uygulandı (hepsi 100)",
      after5.every((p) => Number(p.price) === 100)
    );

    // Filtre yok → 400
    const r6 = await fetch(`${BASE}/api/admin/products/bulk-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ filter: {}, mode: "set", value: 50 }),
    });
    check("empty filter → 400", r6.status === 400);

    // Audit log
    const auditCount = await prisma.auditLog.count({
      where: {
        actorId: adminUser.id,
        action: "PRODUCT_BULK_PRICE_UPDATE",
      },
    });
    check("audit log >= 5", auditCount >= 5, `actual=${auditCount}`);

    // Cleanup
    await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
    createdIds = [];
    await prisma.publisher.delete({ where: { id: pub.id } });
    pubId = null;
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
    if (pubId) {
      await prisma.publisher.delete({ where: { id: pubId } }).catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
