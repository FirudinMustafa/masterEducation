import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

export async function GET(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const dealerId = req.nextUrl.searchParams.get("dealerId");
  if (!dealerId) {
    return NextResponse.json({ error: "dealerId gerekli." }, { status: 400 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { companyName: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  const [rules, publishers, categories, discountGroups] = await Promise.all([
    prisma.dealerDiscount.findMany({
      where: { dealerId },
      include: {
        product: { select: { nopId: true, name: true, sku: true } },
        category: { select: { name: true, slug: true } },
      },
    }),
    prisma.publisher.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, type: true },
    }),
    prisma.product.findMany({
      where: { discountGroup: { not: null } },
      select: { discountGroup: true },
      distinct: ["discountGroup"],
    }),
  ]);

  const wb = createBrandedWorkbook();

  buildBrandedSheet(wb, "İskontolar", {
    title: "İskonto Matrisi",
    subtitle: `Bayi: ${dealer.companyName}  ·  ${new Date().toLocaleDateString("tr-TR")}  ·  ${rules.length} kural`,
    intro:
      "scope: PRODUCT, CATEGORY, DISCOUNT_GROUP, PUBLISHER veya GLOBAL. Oncelik sirasi: PRODUCT > CATEGORY > DISCOUNT_GROUP > PUBLISHER > GLOBAL. " +
      "PRODUCT icin productSku/productId, CATEGORY icin categorySlug/categoryId, PUBLISHER icin publisherSlug/publisherId, DISCOUNT_GROUP icin discountGroup yeterli. " +
      "Yeni kural eklemek icin bos satira scope + discountPct ve ilgili kimlikleri girip yükleyin.",
    columns: [
      { header: "scope", key: "scope", width: 16 },
      { header: "discountPct", key: "discountPct", width: 12, numFmt: "0.00" },
      { header: "productSku", key: "productSku", width: 18 },
      { header: "productName", key: "productName", width: 42 },
      { header: "productId", key: "productId", width: 28 },
      { header: "categorySlug", key: "categorySlug", width: 20 },
      { header: "categoryId", key: "categoryId", width: 28 },
      { header: "publisherSlug", key: "publisherSlug", width: 20 },
      { header: "publisherId", key: "publisherId", width: 28 },
      { header: "discountGroup", key: "discountGroup", width: 18 },
    ],
    rows: rules.map((r) => ({
      scope: r.scope,
      discountPct: Number(r.discountPct),
      productSku: r.product?.sku ?? "",
      productName: r.product?.name ?? "",
      productId: r.productId ?? "",
      categorySlug: r.category?.slug ?? "",
      categoryId: r.categoryId ?? "",
      publisherSlug: "",
      publisherId: r.publisherId ?? "",
      discountGroup: r.discountGroup ?? "",
    })),
  });

  buildBrandedSheet(wb, "Yayınevleri", {
    title: "Yayınevi Referans",
    subtitle: "PUBLISHER scope icin publisherSlug veya publisherId kullanin",
    columns: [
      { header: "publisherSlug", key: "slug", width: 22 },
      { header: "publisherId", key: "id", width: 28 },
      { header: "Yayınevi Adi", key: "name", width: 36 },
    ],
    rows: publishers.map((p) => ({ slug: p.slug, id: p.id, name: p.name })),
  });

  buildBrandedSheet(wb, "Kategoriler", {
    title: "Kategori Referans",
    subtitle: "CATEGORY scope icin categorySlug veya categoryId kullanin",
    columns: [
      { header: "categorySlug", key: "slug", width: 22 },
      { header: "categoryId", key: "id", width: 28 },
      { header: "Kategori Adi", key: "name", width: 36 },
      { header: "Tip", key: "type", width: 10 },
    ],
    rows: categories.map((c) => ({ slug: c.slug, id: c.id, name: c.name, type: c.type })),
  });

  const groupList = discountGroups.filter((g) => !!g.discountGroup).map((g) => g.discountGroup!);
  buildBrandedSheet(wb, "İskonto Gruplari", {
    title: "İskonto Grup Referans",
    subtitle: "DISCOUNT_GROUP scope icin kullanilabilecek etiketler",
    columns: [
      { header: "discountGroup", key: "group", width: 30 },
    ],
    rows: groupList.map((g) => ({ group: g })),
  });

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = dealer.companyName.replace(/[^a-zA-Z0-9]+/g, "_");

  return excelResponse(buffer as ArrayBuffer, `iskontolar_${safeName}.xlsx`);
}
