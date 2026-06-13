import { prisma } from "@/lib/prisma";
import {
  applyDealerPricing,
  getSessionPricingContext,
  type SessionPricingContext,
} from "@/lib/session-pricing";
import { getProductRatings } from "@/lib/product-ratings";
import { Hero } from "@/components/home/hero";
import { BannerSlider } from "@/components/home/banner-slider";
import { CategoryShowcase } from "@/components/home/category-showcase";
import { PublisherMarquee } from "@/components/home/publisher-marquee";
import { ProductCarousel } from "@/components/home/product-carousel";
import { DealerCTA } from "@/components/home/dealer-cta";
import { productImageUrl } from "@/lib/images";

// Ana sayfa kategori vitrininde tercih edilen sıra (8 ana kategori).
const HOMEPAGE_CATEGORY_ORDER = [
  "ders-kitabi",
  "yardimci-ders-kaynagi",
  "hikaye-kitabi",
  "skills-kitabi",
  "dijital",
  "kultur-kitabi",
  "ogretmen-kitabi",
  "sozluk",
];

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
    images: { orderBy: [{ displayOrder: "asc" as const }, { pictureId: "asc" as const }], take: 1 },
  };
  const [newArrivals, topSellers, categories, publishers, productCount, publisherCount, banners] =
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
      prisma.banner.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, imageUrl: true, linkUrl: true, title: true },
      }),
    ]);
  const [mappedNew, mappedTop] = await Promise.all([
    mapWithPricing(newArrivals, ctx),
    mapWithPricing(topSellers, ctx),
  ]);

  // Kategorileri 8 ana kategori tercih sırasına göre diz (vitrinde tutarlı sıra).
  const mappedCategories = categories.map((c) => ({ ...c, count: c._count.products }));
  mappedCategories.sort((a, b) => {
    const ia = HOMEPAGE_CATEGORY_ORDER.indexOf(a.slug);
    const ib = HOMEPAGE_CATEGORY_ORDER.indexOf(b.slug);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name, "tr");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return {
    newArrivals: mappedNew,
    topSellers: mappedTop,
    categories: mappedCategories,
    publishers: publishers.map((p) => ({ ...p, count: p._count.products })),
    productCount,
    publisherCount,
    banners,
  };
}

export default async function HomePage() {
  const pricingCtx = await getSessionPricingContext();
  const data = await getData(pricingCtx);

  // Hero showcase: gercek gorselli ilk 4 yeni ürün — yoksa hero zarif fallback
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
      {/* İlk bölüm: admin'den yönetilen banner slider; banner yoksa sade hero. */}
      {data.banners.length > 0 ? (
        <BannerSlider slides={data.banners} />
      ) : (
        <Hero
          productCount={data.productCount}
          publisherCount={data.publisherCount}
          showcase={showcase}
        />
      )}

      {/* 8 ana kategori vitrini */}
      <CategoryShowcase categories={data.categories.slice(0, 8)} />

      {/* Altında devam eden ürün slide'ı */}
      <ProductCarousel
        products={data.newArrivals}
        eyebrow="Yeni Gelenler"
        title="Yeni eklenen ürünler"
        subtitle="Kataloğa yeni eklenen kitaplar"
        link="/urunler?siralama=yeni"
      />

      <ProductCarousel
        products={data.topSellers}
        eyebrow="Öne Çıkanlar"
        title="Çok tercih edilenler"
        subtitle="Bu hafta en çok ilgi gören kitaplar"
        link="/urunler"
      />

      <PublisherMarquee publishers={data.publishers} />

      <DealerCTA />
    </div>
  );
}
