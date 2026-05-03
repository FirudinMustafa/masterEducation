import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { productImageUrl } from "@/lib/images";

const bodySchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(1000),
      })
    )
    .max(500),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Gecersiz istek." }, { status: 400 });
  }

  const productIds = parsed.data.items.map((i) => i.productId);
  if (productIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      stockQuantity: true,
      isPublished: true,
      publisherId: true,
      categoryId: true,
      discountGroup: true,
      images: {
        select: { filename: true },
        orderBy: { displayOrder: "asc" },
        take: 1,
      },
    },
  });

  const ctx = await getSessionPricingContext();
  const priced = applyDealerPricing(
    products.map((p) => ({
      id: p.id,
      price: Number(p.price),
      categoryId: p.categoryId,
      publisherId: p.publisherId,
      discountGroup: p.discountGroup,
    })),
    ctx
  );
  const priceById = new Map(priced.map((p) => [p.id, p]));

  const items = products.map((p) => {
    const pricing = priceById.get(p.id);
    const finalPrice =
      pricing?.dealerPrice != null ? pricing.dealerPrice : Number(p.price);
    return {
      productId: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      price: finalPrice,
      stockQuantity: p.stockQuantity,
      imageSrc: p.images[0] ? productImageUrl(p.images[0].filename) : null,
      isPublished: p.isPublished,
    };
  });

  return NextResponse.json({ items });
}
