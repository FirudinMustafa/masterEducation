/**
 * Faz 14 dogrulama: bulk image upload (multi-file, SKU eşleştirme).
 *
 *  1. Admin login
 *  2. Test publisher + 3 ürün oluştur (FAZ14-A/B/C SKU'larıyla)
 *  3. 5 dosya hazırla:
 *     - FAZ14-A.jpg (eşleşir)
 *     - FAZ14-B.png (eşleşir)
 *     - FAZ14-NONEXISTENT.jpg (unmatched)
 *     - FAZ14-C.txt (invalid_mime)
 *     - FAZ14-A.png (duplicate SKU)
 *  4. dryRun=true → 3 matched, 1 unmatched, 1 invalid, 1 duplicate
 *  5. apply → kayıtlı dosyalar + ProductImage kayıtları + hasImage=true
 *  6. Cleanup
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
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

// Minimal valid JPEG (3 bytes magic + zero-content rest)
const MINIMAL_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);
// Minimal valid PNG (8 byte signature + IHDR + IEND chunks — 1x1 px)
const MINIMAL_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62,
  0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

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

  let pubId: string | null = null;
  let createdIds: string[] = [];
  let adminId: string | null = null;
  const savedFilenames: string[] = [];

  try {
    const adminEmail = `faz14-admin-${ts}@example.test`;
    const adminPwd = "test1234";
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Faz14 Admin",
        passwordHash: await bcrypt.hash(adminPwd, 10),
        role: "ADMIN",
        emailVerified: new Date(),
      },
    });
    adminId = admin.id;
    await loginAsAdmin(adminEmail, adminPwd);

    const pub = await prisma.publisher.create({
      data: { name: `Faz14 Pub ${ts}`, slug: `faz14-pub-${ts}` },
    });
    pubId = pub.id;

    const skuA = `FAZ14-A-${ts}`;
    const skuB = `FAZ14-B-${ts}`;
    const skuC = `FAZ14-C-${ts}`;
    for (const [sku, i] of [
      [skuA, 0],
      [skuB, 1],
      [skuC, 2],
    ] as const) {
      const p = await prisma.product.create({
        data: {
          nopId: 9830000 + (ts % 10000) + i,
          name: `Faz14 ${sku}`,
          slug: `faz14-${sku.toLowerCase()}`,
          sku,
          price: 100,
          vatRate: 20,
          stockQuantity: 1,
          publisherId: pub.id,
          isPublished: true,
        },
        select: { id: true },
      });
      createdIds.push(p.id);
    }

    function fileFromBytes(name: string, type: string, bytes: Uint8Array): File {
      // TS strict: Uint8Array<ArrayBufferLike> → ArrayBuffer; cast et
      return new File([bytes.buffer as ArrayBuffer], name, { type });
    }

    // 5 dosya hazirla
    const fA = fileFromBytes(`${skuA}.jpg`, "image/jpeg", MINIMAL_JPEG);
    const fB = fileFromBytes(`${skuB}.png`, "image/png", MINIMAL_PNG);
    const fNon = fileFromBytes(
      `FAZ14-NOPE-${ts}.jpg`,
      "image/jpeg",
      MINIMAL_JPEG
    );
    const fInvalid = fileFromBytes(
      `${skuC}.txt`,
      "text/plain",
      new TextEncoder().encode("hello")
    );
    const fDup = fileFromBytes(`${skuA}.png`, "image/png", MINIMAL_PNG);

    function buildFD(): FormData {
      const fd = new FormData();
      fd.append("files", fA);
      fd.append("files", fB);
      fd.append("files", fNon);
      fd.append("files", fInvalid);
      fd.append("files", fDup);
      return fd;
    }

    // dryRun
    {
      const r = await fetch(
        `${BASE}/api/admin/products/bulk-upload-images?dryRun=1`,
        { method: "POST", body: buildFD(), headers: { cookie: cookieHeader() } }
      );
      const d = (await r.json()) as {
        counts: { total: number; matched: number; unmatched: number; invalid: number };
        duplicates: string[];
        applied: boolean;
        preview: { sku: string; status: string }[];
      };
      check("dryRun 200", r.status === 200);
      check("applied=false", d.applied === false);
      check("total=5", d.counts.total === 5);
      check("matched=3 (A, B, dup A)", d.counts.matched === 3);
      check("unmatched=1 (NOPE)", d.counts.unmatched === 1);
      check("invalid=1 (txt)", d.counts.invalid === 1);
      check(
        "duplicate SKU listesi A var",
        d.duplicates.includes(skuA)
      );
    }

    // apply
    {
      const r = await fetch(`${BASE}/api/admin/products/bulk-upload-images`, {
        method: "POST",
        body: buildFD(),
        headers: { cookie: cookieHeader() },
      });
      const d = (await r.json()) as {
        saved: number;
        productsTouched: number;
        applied: boolean;
        errors: { filename: string; error: string }[];
      };
      check("apply 200", r.status === 200);
      check("applied=true", d.applied === true);
      check("saved=3", d.saved === 3);
      check(
        "productsTouched=2 (A unique, B; dup A is also A)",
        d.productsTouched === 2
      );
    }

    // DB doğrulama: A 2 görsel, B 1 görsel
    const productAImages = await prisma.productImage.findMany({
      where: { product: { sku: skuA } },
      select: { filename: true, displayOrder: true },
    });
    const productBImages = await prisma.productImage.findMany({
      where: { product: { sku: skuB } },
      select: { filename: true },
    });
    const productCImages = await prisma.productImage.findMany({
      where: { product: { sku: skuC } },
    });
    check("A: 2 görsel (jpg + dup png)", productAImages.length === 2);
    check("B: 1 görsel", productBImages.length === 1);
    check("C: 0 görsel (invalid_mime atlandı)", productCImages.length === 0);

    for (const img of [...productAImages, ...productBImages]) {
      savedFilenames.push(img.filename);
    }

    // hasImage=true
    const aProd = await prisma.product.findFirst({
      where: { sku: skuA },
      select: { hasImage: true },
    });
    const bProd = await prisma.product.findFirst({
      where: { sku: skuB },
      select: { hasImage: true },
    });
    const cProd = await prisma.product.findFirst({
      where: { sku: skuC },
      select: { hasImage: true },
    });
    check("A.hasImage=true", aProd?.hasImage === true);
    check("B.hasImage=true", bProd?.hasImage === true);
    check("C.hasImage=false (degisemedi)", cProd?.hasImage === false);

    // Empty form
    {
      const fd = new FormData();
      const r = await fetch(`${BASE}/api/admin/products/bulk-upload-images`, {
        method: "POST",
        body: fd,
        headers: { cookie: cookieHeader() },
      });
      check("empty body → 400", r.status === 400);
    }

    // Audit
    const auditCount = await prisma.auditLog.count({
      where: {
        actorId: admin.id,
        action: "PRODUCT_BULK_IMAGE_UPLOAD",
      },
    });
    check("Audit kaydı var", auditCount >= 1);

    // Cleanup
    const uploadDir = path.join(process.cwd(), "public", "images", "products");
    for (const fn of savedFilenames) {
      await unlink(path.join(uploadDir, fn)).catch(() => {});
    }
    await prisma.productImage.deleteMany({
      where: { productId: { in: createdIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdIds } } });
    createdIds = [];
    if (pubId) await prisma.publisher.delete({ where: { id: pubId } });
    pubId = null;
    if (adminId) await prisma.user.delete({ where: { id: adminId } });

    console.log(`\n[Result] ${pass}/${total} checks passed`);
    if (pass !== total) process.exitCode = 1;
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    if (createdIds.length > 0) {
      await prisma.productImage
        .deleteMany({ where: { productId: { in: createdIds } } })
        .catch(() => {});
      await prisma.product
        .deleteMany({ where: { id: { in: createdIds } } })
        .catch(() => {});
    }
    if (pubId)
      await prisma.publisher.delete({ where: { id: pubId } }).catch(() => {});
    if (adminId)
      await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
