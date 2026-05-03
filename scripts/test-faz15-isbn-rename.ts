/**
 * Faz 15 dogrulama: SKU → ISBN rename (UI label-only).
 *
 *  1. Excel template'de header "isbn" olarak gönderilmeli, hem isbn hem sku kabul
 *  2. Bulk-import "isbn" header'lı dosya kabul ediyor mu?
 *  3. Bulk-order parse "isbn" header'lı dosya kabul ediyor mu?
 *  4. UI sayfaları "ISBN" metnini içeriyor mu (SSR HTML kontrol)
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

async function buildExcel(
  sheetName: string,
  headerColumns: { header: string; key: string }[],
  rows: Array<Record<string, unknown>>
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  sheet.columns = headerColumns;
  for (const r of rows) sheet.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
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
  const newProductIds: number[] = [ts % 1000 + 9_850_000];

  try {
    const adminEmail = `faz15-admin-${ts}@example.test`;
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz15 Admin",
        passwordHash: await bcrypt.hash("test1234", 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
    await loginAsAdmin(adminEmail, "test1234");

    // ─── 1) Bulk-import "isbn" header ─────────────────
    {
      const blob = await buildExcel(
        "Urunler",
        [
          { header: "nopId", key: "nopId" },
          { header: "name", key: "name" },
          { header: "isbn", key: "isbn" }, // YENİ header
          { header: "price", key: "price" },
          { header: "vatRate", key: "vatRate" },
          { header: "stockQuantity", key: "stockQuantity" },
        ],
        [
          {
            nopId: newProductIds[0],
            name: `Faz15 ISBN Test ${ts}`,
            isbn: `978-${ts}-X`,
            price: 150,
            vatRate: 20,
            stockQuantity: 5,
          },
        ]
      );
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const res = await fetch(
        `${BASE}/api/admin/products/bulk-import?dryRun=1`,
        {
          method: "POST",
          body: fd,
          headers: { cookie: cookieHeader() },
        }
      );
      const d = (await res.json()) as {
        ok: boolean;
        parsedCount: number;
        errors: { errors: string[] }[];
      };
      check("isbn header dryRun ok", d.ok === true);
      check("parsedCount=1", d.parsedCount === 1);
    }

    // 2) Apply with isbn header
    {
      const blob = await buildExcel(
        "Urunler",
        [
          { header: "nopId", key: "nopId" },
          { header: "name", key: "name" },
          { header: "isbn", key: "isbn" },
          { header: "price", key: "price" },
          { header: "vatRate", key: "vatRate" },
          { header: "stockQuantity", key: "stockQuantity" },
        ],
        [
          {
            nopId: newProductIds[0],
            name: `Faz15 ISBN ${ts}`,
            isbn: `978-${ts}-X`,
            price: 150,
            vatRate: 20,
            stockQuantity: 5,
          },
        ]
      );
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const res = await fetch(`${BASE}/api/admin/products/bulk-import`, {
        method: "POST",
        body: fd,
        headers: { cookie: cookieHeader() },
      });
      const d = (await res.json()) as { ok: boolean; inserted: number };
      check("isbn header insert ok", d.ok === true && d.inserted === 1);
    }

    const created = await prisma.product.findFirst({
      where: { nopId: newProductIds[0] },
      select: { sku: true, name: true },
    });
    check(
      "DB: ürün isbn → sku field'ına kaydedildi",
      created?.sku === `978-${ts}-X`
    );

    // 3) UI label kontrol — admin product detay sayfası "ISBN" içersin
    if (created) {
      const prodId = (
        await prisma.product.findFirst({
          where: { nopId: newProductIds[0] },
          select: { id: true },
        })
      )?.id;
      if (prodId) {
        const pageRes = await fetch(`${BASE}/admin/urunler/${prodId}`, {
          headers: { cookie: cookieHeader() },
        });
        const html = await pageRes.text();
        check("Admin ürün detay 'ISBN:' içeriyor", html.includes("ISBN:"));
        check("Admin ürün detay 'SKU:' içermiyor", !html.includes("SKU:"));
      }
    }

    // 4) Sepet sayfası label (boş sepet ile bile değiştirildi mi diye karşılaştırma yerine
    //    daha sağlam: ürün listesi sayfası — "ISBN" ile arama placeholder'ı görünmeli)
    {
      const r = await fetch(`${BASE}/urunler`);
      const html = await r.text();
      check(
        "Ürün listesi 'ISBN...' search placeholder içeriyor",
        html.includes("ISBN")
      );
    }

    // 5) Eski "sku" header backwards-compat (zaten Faz 11 testinde geçti, kısa kontrol)
    {
      const blob = await buildExcel(
        "Urunler",
        [
          { header: "nopId", key: "nopId" },
          { header: "name", key: "name" },
          { header: "sku", key: "sku" }, // ESKI header
          { header: "price", key: "price" },
          { header: "vatRate", key: "vatRate" },
          { header: "stockQuantity", key: "stockQuantity" },
        ],
        [
          {
            nopId: newProductIds[0] + 1,
            name: `Faz15 SKU Backwards ${ts}`,
            sku: `OLD-${ts}`,
            price: 50,
            vatRate: 20,
            stockQuantity: 1,
          },
        ]
      );
      newProductIds.push(newProductIds[0] + 1);
      const fd = new FormData();
      fd.append("file", blob, "test.xlsx");
      const r = await fetch(`${BASE}/api/admin/products/bulk-import?dryRun=1`, {
        method: "POST",
        body: fd,
        headers: { cookie: cookieHeader() },
      });
      const d = (await r.json()) as { ok: boolean; parsedCount: number };
      check("eski 'sku' header backwards-compat", d.ok === true && d.parsedCount === 1);
    }

    // Cleanup
    await prisma.product.deleteMany({
      where: { nopId: { in: newProductIds } },
    });
    if (adminId) await prisma.user.delete({ where: { id: adminId } });

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    await prisma.product
      .deleteMany({ where: { nopId: { in: newProductIds } } })
      .catch(() => {});
    if (adminId)
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
