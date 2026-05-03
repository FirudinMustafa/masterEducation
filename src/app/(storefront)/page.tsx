import { prisma } from "@/lib/prisma";
import {
  applyDealerPricing,
  getSessionPricingContext,
  type SessionPricingContext,
} from "@/lib/session-pricing";
import { getProductRatings } from "@/lib/product-ratings";
import { Hero } from "@/components/home/hero";
import { PublisherMarquee } from "@/components/home/publisher-marquee";
import { CategoryBento } from "@/components/home/category-bento";
import { ProductCarousel } from "@/components/home/product-carousel";
import { SpotlightFeature } from "@/components/home/spotlight-feature";
import { StatsStrip } from "@/components/home/stats-strip";
import { TrustFeatures } from "@/components/home/trust-features";
import { productImageUrl } from "@/lib/images";

async function mapWithPricing(
  products: Array<{
    id: string;
    name: string;
    slug: string;
    price: unknown;
    oldPrice: unknown;
    sku: string;
    stockQuantity: number;
    hasImage: boolean;
    publisherId: string | null;
    categoryId: string | null;
    discountGroup: string | null;
    createdAt?: Date;
    publisher: { name: string } | null;
    images: { filename: string }[];
  }>,
  ctx: SessionPricingContext
) {
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
  const byId = new Map(priced.map((p) => [p.id, p]));
  const ratings = await getProductRatings(products.map((p) => p.id));
  return products.map((p) => {
    const pp = byId.get(p.id);
    const r = ratings.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      dealerPrice: pp?.dealerPrice ?? null,
      dealerDiscountPct: pp?.dealerDiscountPct ?? null,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      hasImage: p.hasImage,
      publisherName: p.publisher?.name ?? null,
      imageSrc: p.images[0] ? productImageUrl(p.images[0].filename) : null,
      avgRating: r?.avg ?? null,
      reviewCount: r?.count ?? 0,
      createdAt: p.createdAt ?? null,
    };
  });
}

async function getData(ctx: SessionPricingContext) {
  const baseInclude = {
    publisher: { select: { name: true } },
    images: { orderBy: { displayOrder: "asc" as const }, take: 1 },
  };
  const [newArrivals, topSellers, categories, publishers, productCount, publisherCount] =
    await Promise.all([
      prisma.product.findMany({
        where: {
          isPublished: true,
          images: { some: {} },
          price: { gt: 0 },
          stockQuantity: { gt: 0 },
        },
        include: baseInclude,
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.product.findMany({
        where: {
          isPublished: true,
          images: { some: {} },
          price: { gt: 0 },
          stockQuantity: { gt: 0 },
        },
        include: baseInclude,
        orderBy: { price: "desc" },
        take: 12,
      }),
      prisma.category.findMany({
        where: { type: "ana" },
        select: { slug: true, name: true, _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.publisher.findMany({
        select: { slug: true, name: true, _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.product.count({ where: { isPublished: true } }),
      prisma.publisher.count(),
    ]);
  const [mappedNew, mappedTop] = await Promise.all([
    mapWithPricing(newArrivals, ctx),
    mapWithPricing(topSellers, ctx),
  ]);
  return {
    newArrivals: mappedNew,
    topSellers: mappedTop,
    categories: categories.map((c) => ({ ...c, count: c._count.products })),
    publishers: publishers.map((p) => ({ ...p, count: p._count.products })),
    productCount,
    publisherCount,
  };
}

export default async function HomePage() {
  const pricingCtx = await getSessionPricingContext();
  const data = await getData(pricingCtx);

  // Hero showcase: gercek gorselli ilk 4 yeni urun — yoksa hero zarif fallback
  const showcase = data.newArrivals
    .filter((p) => p.imageSrc)
    .slice(0, 4)
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      imageSrc: p.imageSrc,
      publisherName: p.publisherName,
    }));

  return (
    <div className="bg-neutral-50">
      <Hero
        productCount={data.productCount}
        publisherCount={data.publisherCount}
        showcase={showcase}
      />

      <PublisherMarquee publishers={data.publishers} />

      <CategoryBento categories={data.categories} />

      <SpotlightFeature
        products={data.newArrivals.filter((p) => p.imageSrc).slice(0, 3)}
        eyebrow="Yeni Sezon"
        title="Bu sezon one cikanlar"
        italicWord="one cikanlar"
      />

      <ProductCarousel
        products={data.topSellers}
        eyebrow="Editor Sectimi"
        title="Cok satan klasikler"
        subtitle="Bu hafta en cok tercih edilen kitaplar"
        link="/urunler?siralama=cok-satan"
      />

      <StatsStrip
        productCount={data.productCount}
        publisherCount={data.publisherCount}
      />

      <TrustFeatures />
    </div>
  );
}
