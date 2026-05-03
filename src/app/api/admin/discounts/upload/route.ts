import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { DiscountScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const ALLOWED_SCOPES: DiscountScope[] = [
  "PRODUCT",
  "CATEGORY",
  "DISCOUNT_GROUP",
  "PUBLISHER",
  "GLOBAL",
];

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const formData = await req.formData();
  const dealerId = formData.get("dealerId");
  const file = formData.get("file");
  const replace = formData.get("replace") === "true";

  if (typeof dealerId !== "string" || !dealerId) {
    return NextResponse.json({ error: "dealerId gerekli." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  const arrayBuf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuf);
  } catch {
    return NextResponse.json({ error: "Excel dosyasi okunamadi." }, { status: 400 });
  }

  const sheet = wb.getWorksheet("Iskontolar") ?? wb.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Gecerli sayfa bulunamadi." }, { status: 400 });
  }

  // Branded template'de row 1 marka adidir, basliklar row 6 veya 7'de olabilir.
  // Ilk 15 satiri tarayip "scope" ve "discountPct" ikiliniyi bulan satiri
  // baslik satiri sayiyoruz.
  let headerRowNum = -1;
  const headers: string[] = [];
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell((cell, colNumber) => {
      candidate[colNumber - 1] = String(cell.value ?? "").trim();
    });
    if (candidate.includes("scope") && candidate.includes("discountPct")) {
      headerRowNum = r;
      for (let i = 0; i < candidate.length; i++) headers[i] = candidate[i] ?? "";
      break;
    }
  }

  if (headerRowNum < 0) {
    return NextResponse.json(
      { error: "Basliklarda 'scope' ve 'discountPct' zorunlu (ilk 15 satirda bulunamadi)." },
      { status: 400 }
    );
  }

  const colIdx = (name: string) => headers.indexOf(name);
  const iScope = colIdx("scope");
  const iPct = colIdx("discountPct");
  const iProductId = colIdx("productId");
  const iProductSku = colIdx("productSku");
  const iCategoryId = colIdx("categoryId");
  const iCategorySlug = colIdx("categorySlug");
  const iPublisherId = colIdx("publisherId");
  const iPublisherSlug = colIdx("publisherSlug");
  const iDiscountGroup = colIdx("discountGroup");

  type Row = {
    rowNum: number;
    scope: DiscountScope;
    discountPct: number;
    productId: string | null;
    productSku: string | null;
    categoryId: string | null;
    categorySlug: string | null;
    publisherId: string | null;
    publisherSlug: string | null;
    discountGroup: string | null;
  };
  const rawRows: Row[] = [];
  const errors: string[] = [];

  for (let rowNum = headerRowNum + 1; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const scopeRaw = String(row.getCell(iScope + 1).value ?? "").trim();
    if (!scopeRaw) continue;
    const scope = scopeRaw.toUpperCase() as DiscountScope;
    if (!ALLOWED_SCOPES.includes(scope)) {
      // Branded footer ("info@...") gibi data olmayan satirlari sessizce atla.
      if (/@|·/.test(scopeRaw) && scopeRaw.length > 20) continue;
      errors.push(`Satir ${rowNum}: gecersiz scope '${scopeRaw}'.`);
      continue;
    }

    const pctRaw = row.getCell(iPct + 1).value;
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      errors.push(`Satir ${rowNum}: gecersiz discountPct.`);
      continue;
    }

    const productId =
      iProductId >= 0
        ? String(row.getCell(iProductId + 1).value ?? "").trim() || null
        : null;
    const productSku =
      iProductSku >= 0
        ? String(row.getCell(iProductSku + 1).value ?? "").trim() || null
        : null;
    const categoryId =
      iCategoryId >= 0
        ? String(row.getCell(iCategoryId + 1).value ?? "").trim() || null
        : null;
    const categorySlug =
      iCategorySlug >= 0
        ? String(row.getCell(iCategorySlug + 1).value ?? "").trim() || null
        : null;
    const publisherId =
      iPublisherId >= 0
        ? String(row.getCell(iPublisherId + 1).value ?? "").trim() || null
        : null;
    const publisherSlug =
      iPublisherSlug >= 0
        ? String(row.getCell(iPublisherSlug + 1).value ?? "").trim() || null
        : null;
    const discountGroup =
      iDiscountGroup >= 0
        ? String(row.getCell(iDiscountGroup + 1).value ?? "").trim() || null
        : null;

    if (scope === "PRODUCT" && !productId && !productSku) {
      errors.push(`Satir ${rowNum}: PRODUCT icin productId veya productSku zorunlu.`);
      continue;
    }
    if (scope === "CATEGORY" && !categoryId && !categorySlug) {
      errors.push(`Satir ${rowNum}: CATEGORY icin categoryId veya categorySlug zorunlu.`);
      continue;
    }
    if (scope === "PUBLISHER" && !publisherId && !publisherSlug) {
      errors.push(`Satir ${rowNum}: PUBLISHER icin publisherId veya publisherSlug zorunlu.`);
      continue;
    }
    if (scope === "DISCOUNT_GROUP" && !discountGroup) {
      errors.push(`Satir ${rowNum}: DISCOUNT_GROUP icin discountGroup zorunlu.`);
      continue;
    }

    rawRows.push({
      rowNum,
      scope,
      discountPct: pct,
      productId,
      productSku,
      categoryId,
      categorySlug,
      publisherId,
      publisherSlug,
      discountGroup,
    });
  }

  // SKU / slug → id cozumlemesi (tek sorguda).
  const skus = Array.from(
    new Set(rawRows.filter((r) => !r.productId && r.productSku).map((r) => r.productSku!)),
  );
  const catSlugs = Array.from(
    new Set(rawRows.filter((r) => !r.categoryId && r.categorySlug).map((r) => r.categorySlug!)),
  );
  const slugs = Array.from(
    new Set(
      rawRows.filter((r) => !r.publisherId && r.publisherSlug).map((r) => r.publisherSlug!),
    ),
  );
  const [productsBySku, categoriesBySlug, publishersBySlug] = await Promise.all([
    skus.length
      ? prisma.product.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true },
        })
      : Promise.resolve([]),
    catSlugs.length
      ? prisma.category.findMany({
          where: { slug: { in: catSlugs } },
          select: { id: true, slug: true },
        })
      : Promise.resolve([]),
    slugs.length
      ? prisma.publisher.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true },
        })
      : Promise.resolve([]),
  ]);
  const skuMap = new Map(productsBySku.map((p) => [p.sku, p.id]));
  const catSlugMap = new Map(categoriesBySlug.map((c) => [c.slug, c.id]));
  const slugMap = new Map(publishersBySlug.map((p) => [p.slug, p.id]));

  const rows: Array<{
    scope: DiscountScope;
    discountPct: number;
    productId: string | null;
    categoryId: string | null;
    publisherId: string | null;
    discountGroup: string | null;
  }> = [];
  for (const r of rawRows) {
    let productId = r.productId;
    if (!productId && r.productSku) {
      productId = skuMap.get(r.productSku) ?? null;
      if (!productId) {
        errors.push(`Satir ${r.rowNum}: productSku '${r.productSku}' bulunamadi.`);
        continue;
      }
    }
    let categoryId = r.categoryId;
    if (!categoryId && r.categorySlug) {
      categoryId = catSlugMap.get(r.categorySlug) ?? null;
      if (!categoryId) {
        errors.push(`Satir ${r.rowNum}: categorySlug '${r.categorySlug}' bulunamadi.`);
        continue;
      }
    }
    let publisherId = r.publisherId;
    if (!publisherId && r.publisherSlug) {
      publisherId = slugMap.get(r.publisherSlug) ?? null;
      if (!publisherId) {
        errors.push(`Satir ${r.rowNum}: publisherSlug '${r.publisherSlug}' bulunamadi.`);
        continue;
      }
    }
    rows.push({
      scope: r.scope,
      discountPct: r.discountPct,
      productId,
      categoryId,
      publisherId,
      discountGroup: r.discountGroup,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Isleme alinacak satir yok.", errors },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    if (replace) {
      await tx.dealerDiscount.deleteMany({ where: { dealerId } });
    }
    let upserted = 0;
    for (const r of rows) {
      const existing = await tx.dealerDiscount.findFirst({
        where: {
          dealerId,
          scope: r.scope,
          productId: r.productId,
          categoryId: r.categoryId,
          publisherId: r.publisherId,
          discountGroup: r.discountGroup,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.dealerDiscount.update({
          where: { id: existing.id },
          data: { discountPct: r.discountPct },
        });
      } else {
        await tx.dealerDiscount.create({
          data: {
            dealerId,
            scope: r.scope,
            discountPct: r.discountPct,
            productId: r.productId,
            categoryId: r.categoryId,
            publisherId: r.publisherId,
            discountGroup: r.discountGroup,
          },
        });
      }
      upserted++;
    }
    return { upserted };
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DISCOUNT_BULK_IMPORT",
    entityType: "dealer",
    entityId: dealerId,
    metadata: {
      upserted: result.upserted,
      replaced: replace,
      errorCount: errors.length,
    },
  });

  return NextResponse.json({ ...result, errors });
}
