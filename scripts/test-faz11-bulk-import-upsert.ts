/**
 * Faz 11.2 dogrulama: bulk-import upsert mode.
 *
 * 1. Admin login + 2 mevcut ürün oluştur (nopId 9821001, 9821002)
 * 2. Excel build: 3 satır → 2 mevcut nopId + 1 yeni
 * 3. dryRun mode=upsert → willInsert=1, willUpdate=2
 * 4. apply mode=upsert → inserted=1, updated=2
 * 5. DB doğrula: yeni ürün eklendi, mevcutlar yeni fiyat aldı
 * 6. Default mode (insert) ile aynı dosya → 400 (nopId zaten var)
 * 7. Cleanup
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
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

async function buildExcel(rows: Array<Record<string, unknown>>): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Urunler");
  sheet.columns = [
    { header: "nopId", key: "nopId" },
    { header: "name", key: "name" },
    { header: "sku", key: "sku" },
    { header: "price", key: "price" },
    { header: "vatRate", key: "vatRate" },
    { header: "stockQuantity", key: "stockQuantity" },
    { header: "publisher", key: "publisher" },
    { header: "isPublished", key: "isPublished" },
  ];
  for (const r of rows) sheet.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

(async () => {
  const ts = Date.now();
  const baseId = 9821000 + (ts % 1000);
  const ids = [baseId + 1, baseId + 2, baseId + 3];
  let pubId: string | null = null;
  const createdProductIds: string[] = [];
  let pass = 0,
    total = 0;
  const check = (n: string, c: boolean, x?: unknown) => {
    total++;
    if (c) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else console.log(`  ✗ ${n}`, x ?? "");
  };

  try {
    const adminEmail = `faz11-up-${ts}@example.test`;
    const adminPassword = "test1234";
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Upsert Admin",
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    await loginAsAdmin(adminEmail, adminPassword);

    const pub = await prisma.publisher.create({
      data: { name: `Faz11up Pub ${ts}`, slug: `faz11up-${ts}` },
    });
    pubId = pub.id;

    // 2 mevcut ürün
    for (const nopId of [ids[0], ids[1]]) {
      const p = await prisma.product.create({
        data: {
          nopId,
          name: `Eski ${nopId}`,
          slug: `eski-${nopId}`,
          sku: `OLD-${nopId}`,
          price: 50,
          vatRate: 10,
          stockQuantity: 0,
          publisherId: pub.id,
          isPublished: true,
        },
      });
      createdProductIds.push(p.id);
    }

    // Excel: 2 mevcut + 1 yeni
    const blob = await buildExcel([
      {
        nopId: ids[0],
        name: `Yeni Ad ${ids[0]}`,
        sku: `NEW-${ids[0]}`,
        price: 200,
        vatRate: 20,
        stockQuantity: 10,
        publisher: pub.name,
        isPublished: true,
      },
      {
        nopId: ids[1],
        name: `Yeni Ad ${ids[1]}`,
        sku: `NEW-${ids[1]}`,
        price: 250,
        vatRate: 20,
        stockQuantity: 15,
        publisher: pub.name,
        isPublished: true,
      },
      {
        nopId: ids[2],
        name: `Tamamen Yeni ${ids[2]}`,
        sku: `NEW-${ids[2]}`,
        price: 300,
        vatRate: 20,
        stockQuantity: 20,
        publisher: pub.name,
        isPublished: true,
      },
    ]);

    // dryRun upsert
    {
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const res = await fetch(
        `${BASE}/api/admin/products/bulk-import?dryRun=1&mode=upsert`,
        { method: "POST", body: fd, headers: { cookie: cookieHeader() } }
      );
      const d = (await res.json()) as {
        ok: boolean;
        willInsert: number;
        willUpdate: number;
        errorCount: number;
      };
      check("dryRun upsert ok", d.ok === true);
      check("dryRun willInsert=1", d.willInsert === 1);
      check("dryRun willUpdate=2", d.willUpdate === 2);
      check("dryRun errorCount=0", d.errorCount === 0);
    }

    // apply upsert
    {
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const res = await fetch(
        `${BASE}/api/admin/products/bulk-import?mode=upsert`,
        { method: "POST", body: fd, headers: { cookie: cookieHeader() } }
      );
      const d = (await res.json()) as {
        ok: boolean;
        inserted: number;
        updated: number;
      };
      check("apply upsert ok", d.ok === true);
      check("apply inserted=1", d.inserted === 1);
      check("apply updated=2", d.updated === 2);
    }

    // DB
    const after = await prisma.product.findMany({
      where: { nopId: { in: ids } },
      orderBy: { nopId: "asc" },
      select: { nopId: true, name: true, price: true, sku: true, stockQuantity: true },
    });
    check("DB: 3 ürün var", after.length === 3);
    check(
      "DB: nopId-1 fiyat 200",
      after.find((p) => p.nopId === ids[0])?.price.toString() === "200"
    );
    check(
      "DB: nopId-2 stok 15",
      after.find((p) => p.nopId === ids[1])?.stockQuantity === 15
    );
    check(
      "DB: yeni ürün eklendi",
      after.find((p) => p.nopId === ids[2])?.price.toString() === "300"
    );

    // Default insert mode → mevcut nopId hatası
    {
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const res = await fetch(
        `${BASE}/api/admin/products/bulk-import?dryRun=1`,
        { method: "POST", body: fd, headers: { cookie: cookieHeader() } }
      );
      const d = (await res.json()) as { errorCount: number };
      check("insert mode: 2 mevcut nopId hatası", d.errorCount >= 2);
    }

    // Cleanup
    await prisma.product.deleteMany({
      where: { nopId: { in: ids } },
    });
    if (pubId) {
      await prisma.publisher.delete({ where: { id: pubId } });
      pubId = null;
    }
    await prisma.user.delete({ where: { id: adminUser.id } });

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    await prisma.product
      .deleteMany({ where: { nopId: { in: ids } } })
      .catch(() => {});
    if (pubId)
      await prisma.publisher.delete({ where: { id: pubId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
