import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { productImageUrl } from "@/lib/images";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const product = await prisma.product.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
      isPublished: true,
    },
    include: {
      publisher: { select: { id: true, name: true, slug: true } },
      category: { select: { id: true, name: true, slug: true } },
      images: {
        orderBy: { displayOrder: "asc" },
        select: { id: true, filename: true, displayOrder: true },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Urun bulunamadi" }, { status: 404 });
  }

  const pricingCtx = await getSessionPricingContext();
  const [priced] = applyDealerPricing(
    [
      {
        id: product.id,
        price: Number(product.price),
        categoryId: product.categoryId,
        publisherId: product.publisherId,
        discountGroup: product.discountGroup,
      },
    ],
    pricingCtx
  );

  return NextResponse.json({
    id: product.id,
    nopId: product.nopId,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    nameEn: product.nameEn,
    price: Number(product.price),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    vatRate: Number(product.vatRate),
    stockQuantity: product.stockQuantity,
    inStock: product.stockQuantity > 0,
    isPublished: product.isPublished,
    anaTur: product.anaTur,
    detayTur: product.detayTur,
    language: product.language,
    productType: product.productType,
    discountGroup: product.discountGroup,
    publisher: product.publisher,
    category: product.category,
    images: product.images.map((img) => ({
      id: img.id,
      filename: img.filename,
      url: productImageUrl(img.filename),
      displayOrder: img.displayOrder,
    })),
    dealerPrice: priced?.dealerPrice ?? null,
    dealerDiscountPct: priced?.dealerDiscountPct ?? null,
  });
}
