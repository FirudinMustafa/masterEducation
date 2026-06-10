import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { productImageUrl } from "@/lib/images";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  // F-0020: ürün detay endpoint'i scraping hedefi olabilir; IP basina
  // dakikada 120 cagri sayılabilir UI navigasyonu icin yeterli.
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali).
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`product-detail:${ip}`, 120, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin." },
      { status: 429 }
    );
  }

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
        orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }],
        select: { id: true, filename: true, displayOrder: true },
      },
    },
  });

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadi" }, { status: 404 });
  }

  // Fiyat gizleme: ham liste fiyatı (price/oldPrice) yalnız admin'e döner.
  // Bayiye yalnız kendi iskontolu fiyatı (dealerPrice), public'e hiçbiri.
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

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
    price: isAdmin ? Number(product.price) : null,
    oldPrice: isAdmin && product.oldPrice ? Number(product.oldPrice) : null,
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
