import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PriceDisplay } from "@/components/products/price-display";
import { ProductGallery } from "@/components/products/product-gallery";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductGrid } from "@/components/products/product-grid";
import { ProductReviews } from "@/components/products/product-reviews";
import { ProductTabs } from "@/components/products/product-tabs";
import {
  TrackRecentlyViewed,
  RecentlyViewed,
} from "@/components/products/recently-viewed";
import { productImageUrl } from "@/lib/images";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { auth } from "@/lib/auth";
import {
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  BuildingStorefrontIcon,
  StarIconSolid,
} from "@/components/ui/icons";
import type { Metadata } from "next";
import type { ProductSummary } from "@/types/product";
import { cn } from "@/lib/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      name: true,
      nameEn: true,
      sku: true,
      isPublished: true,
      publisher: { select: { name: true } },
      images: { select: { filename: true }, take: 1, orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }] },
    },
  });
  if (!product) return { title: "Ürün Bulunamadi" };

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const canonical = `${baseUrl}/urunler/${slug}`;
  const description = product.publisher
    ? `${product.publisher.name} yayınevinden ${product.name}${
        product.nameEn ? ` (${product.nameEn})` : ""
      }. Master Education'dan guvenli alisveris, hızlı kargo.`
    : product.name;
  const firstImg = product.images[0]
    ? productImageUrl(product.images[0].filename)
    : null;
  const image = firstImg
    ? firstImg.startsWith("http")
      ? firstImg
      : `${baseUrl}${firstImg}`
    : `${baseUrl}/me-logo-v2.png`;

  return {
    title: product.name,
    description,
    alternates: { canonical },
    robots: product.isPublished ? undefined : { index: false, follow: false },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      url: canonical,
      siteName: "Master Education",
      locale: "tr_TR",
      images: [{ url: image, alt: product.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [image],
    },
    other: {
      "product:retailer_item_id": product.sku,
      "product:brand": product.publisher?.name ?? "Master Education",
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      publisher: true,
      category: true,
      images: { orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }] },
    },
  });

  if (!product || !product.isPublished) notFound();

  const inStock = product.stockQuantity > 0;
  const primaryImage = product.images[0];

  const pricingCtx = await getSessionPricingContext();
  const [productPricing] = applyDealerPricing(
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

  const session = await auth();
  const [reviews, ratingAgg, userReview, relatedProducts] = await Promise.all([
    prisma.productReview.findMany({
      where: { productId: product.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
    prisma.productReview.aggregate({
      where: { productId: product.id, status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    session?.user
      ? prisma.productReview.findUnique({
          where: {
            productId_userId: {
              productId: product.id,
              userId: session.user.id,
            },
          },
        })
      : Promise.resolve(null),
    prisma.product.findMany({
      where: {
        isPublished: true,
        publisherId: product.publisherId,
        id: { not: product.id },
        hasImage: true,
      },
      include: {
        publisher: { select: { name: true } },
        images: { orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }], take: 1 },
      },
      take: 8,
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const productUrl = `${baseUrl}/urunler/${product.slug}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    url: productUrl,
    image: primaryImage
      ? [
          (() => {
            const u = productImageUrl(primaryImage.filename);
            return u.startsWith("http") ? u : `${baseUrl}${u}`;
          })(),
        ]
      : [`${baseUrl}/me-logo-v2.png`],
    description: product.publisher
      ? `${product.publisher.name} yayınevinden ${product.name}`
      : product.name,
    brand: product.publisher
      ? { "@type": "Brand", name: product.publisher.name }
      : { "@type": "Brand", name: "Master Education" },
    offers: {
      "@type": "Offer",
      url: productUrl,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Master Education" },
    },
  };
  if (ratingAgg._count._all > 0 && ratingAgg._avg.rating != null) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(ratingAgg._avg.rating).toFixed(2),
      reviewCount: ratingAgg._count._all,
    };
  }

  const summary: ProductSummary = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    price: Number(product.price),
    oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
    dealerPrice: productPricing?.dealerPrice ?? null,
    dealerDiscountPct: productPricing?.dealerDiscountPct ?? null,
    stockQuantity: product.stockQuantity,
    hasImage: product.hasImage,
    publisherName: product.publisher?.name ?? null,
    imageSrc: primaryImage ? productImageUrl(primaryImage.filename) : null,
  };

  const relatedPriced = applyDealerPricing(
    relatedProducts.map((p) => ({
      id: p.id,
      price: Number(p.price),
      categoryId: p.categoryId,
      publisherId: p.publisherId,
      discountGroup: p.discountGroup,
    })),
    pricingCtx
  );
  const relatedPriceById = new Map(relatedPriced.map((p) => [p.id, p]));
  const relatedSummaries: ProductSummary[] = relatedProducts.map((p) => {
    const pp = relatedPriceById.get(p.id);
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
    };
  });

  const avgRating = ratingAgg._avg.rating != null ? Number(ratingAgg._avg.rating) : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
      <script
        type="application/ld+json"
        // </script> ve diger HTML-yorumlanan karakterleri unicode escape et:
        // saldırgan ürün adına "</script><script>..." koyamaz (defense-in-depth).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e")
            .replace(/&/g, "\\u0026"),
        }}
      />
      <TrackRecentlyViewed product={summary} />

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-6 flex items-center gap-1.5 text-xs text-neutral-500">
        <Link href="/" className="hover:text-neutral-900">Anasayfa</Link>
        <ChevronRightIcon className="h-3 w-3 text-neutral-300" />
        <Link href="/urunler" className="hover:text-neutral-900">Ürünler</Link>
        {product.category && (
          <>
            <ChevronRightIcon className="h-3 w-3 text-neutral-300" />
            <Link
              href={`/kategoriler/${product.category.slug}`}
              className="hover:text-neutral-900"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <ChevronRightIcon className="h-3 w-3 text-neutral-300" />
        <span aria-current="page" className="max-w-xs truncate text-neutral-900">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Gallery */}
        <div className="lg:col-span-7">
          <ProductGallery
            images={product.images.map((img) => ({ id: img.id, filename: img.filename }))}
            alt={product.name}
          />
        </div>

        {/* Buy box */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            {product.publisher && (
              <Link
                href={`/yayinevleri/${product.publisher.slug}`}
                className="mb-2 inline-block text-xs font-semibold uppercase tracking-widest text-brand-gold-dark hover:underline"
              >
                {product.publisher.name}
              </Link>
            )}
            <h1 className="mb-3 font-display text-2xl font-bold leading-tight text-neutral-900 md:text-3xl">
              {product.name}
            </h1>
            {product.nameEn && (
              <p className="mb-4 text-sm italic text-neutral-500">{product.nameEn}</p>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
              {avgRating != null && ratingAgg._count._all > 0 && (
                <div className="flex items-center gap-1">
                  <StarIconSolid className="h-4 w-4 text-amber-400" />
                  <span className="font-semibold text-neutral-900">
                    {avgRating.toFixed(1)}
                  </span>
                  <span>({ratingAgg._count._all} yorum)</span>
                </div>
              )}
              <span>ISBN: {product.sku}</span>
              {product.anaTur && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                  {product.anaTur}
                </span>
              )}
              {product.language && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                  {product.language}
                </span>
              )}
            </div>

            <div className="mb-5 rounded-2xl border border-neutral-200 bg-white p-5">
              <PriceDisplay
                price={Number(product.price)}
                oldPrice={product.oldPrice ? Number(product.oldPrice) : null}
                dealerPrice={productPricing?.dealerPrice ?? null}
                discountPct={productPricing?.dealerDiscountPct ?? null}
                isDealer={pricingCtx.dealerId !== null}
                size="lg"
              />
              <div className="mt-3 flex items-center gap-2 text-sm">
                {inStock ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium text-emerald-700">Stokta</span>
                    {product.stockQuantity <= 5 && (
                      <span className="text-amber-700">
                        — yalnizca {product.stockQuantity} adet kaldi
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <XCircleIcon className="h-4 w-4 text-rose-600" />
                    <span className="font-medium text-rose-700">Stokta Yok</span>
                  </>
                )}
              </div>

              <div className="mt-5">
                <AddToCartButton
                  product={{
                    id: product.id,
                    name: product.name,
                    price:
                      productPricing?.dealerPrice != null
                        ? productPricing.dealerPrice
                        : Number(product.price),
                    slug: product.slug,
                    sku: product.sku,
                    stockQuantity: product.stockQuantity,
                    imageSrc: primaryImage
                      ? productImageUrl(primaryImage.filename)
                      : undefined,
                  }}
                  summary={summary}
                />
              </div>
            </div>

            {/* Trust list */}
            <ul className="space-y-2.5 text-sm">
              <TrustRow Icon={TruckIcon} text="Hızlı kargo" />
              <TrustRow Icon={ShieldCheckIcon} text="Guvenli ödeme — 3D Secure destekli" />
              <TrustRow Icon={CreditCardIcon} text="14 gün iade hakki" />
              <TrustRow Icon={BuildingStorefrontIcon} text="Bayiler icin özel iskonto" />
            </ul>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ProductTabs
        tabs={[
          {
            id: "desc",
            label: "Ürün Açıklamasi",
            content: (
              <div className="prose prose-neutral max-w-none text-sm leading-relaxed text-neutral-700">
                {product.description ? (
                  // Admin'de girilen ürün açıklaması — satır sonları korunur.
                  <p className="whitespace-pre-line">{product.description}</p>
                ) : (
                  <>
                    <p>
                      <strong>{product.name}</strong>
                      {product.publisher && (
                        <> — {product.publisher.name} yayınevi</>
                      )}
                      {product.category && <> / {product.category.name}</>}.
                    </p>
                    <p>
                      Master Education sectigi eğitim materyallerinde orjinalligi garanti eder.
                      Bu ürün stogumuzda bulunmakta olup, siparişiniz 1-3 is günu icinde
                      kargoya teslim edilir.
                    </p>
                    {product.nameEn && (
                      <p>
                        <strong>English title:</strong> {product.nameEn}
                      </p>
                    )}
                  </>
                )}
              </div>
            ),
          },
          {
            id: "specs",
            label: "Özellikler",
            content: (
              <ProductSpecs
                product={{
                  sku: product.sku,
                  nameEn: product.nameEn,
                  language: product.language,
                  anaTur: product.anaTur,
                  detayTur: product.detayTur,
                  productType: product.productType,
                  vatRate: Number(product.vatRate),
                  publisher: product.publisher,
                  category: product.category,
                }}
              />
            ),
          },
          {
            id: "reviews",
            label: "Yorumlar",
            badge: ratingAgg._count._all,
            content: (
              <ProductReviews
                productId={product.id}
                reviews={reviews.map((r) => ({
                  id: r.id,
                  rating: r.rating,
                  title: r.title,
                  comment: r.comment,
                  createdAt: r.createdAt,
                  authorName: r.user.name,
                  isOwn: session?.user?.id === r.userId,
                }))}
                ratingAverage={ratingAgg._avg.rating}
                ratingCount={ratingAgg._count._all}
                canReview={!!session?.user}
                userAlreadyReviewed={!!userReview}
              />
            ),
          },
        ]}
      />

      {relatedSummaries.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 font-display text-xl font-bold text-neutral-900">
            Ayni Yayınevinden Digerleri
          </h2>
          <ProductGrid products={relatedSummaries} />
        </section>
      )}

      <RecentlyViewed excludeId={product.id} />
    </div>
  );
}

function TrustRow({
  Icon,
  text,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <li className="flex items-center gap-2 text-neutral-600">
      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
      {text}
    </li>
  );
}

interface ProductSpecsData {
  sku: string;
  nameEn: string | null;
  language: string | null;
  anaTur: string | null;
  detayTur: string | null;
  productType: string | null;
  vatRate: number;
  publisher: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
}

function ProductSpecs({ product }: { product: ProductSpecsData }) {
  // Some source records duplicate anaTur and category.name — suppress the
  // redundant row when they match.
  const categoryName = product.category?.name;
  const showAnaTur =
    product.anaTur && product.anaTur !== categoryName ? product.anaTur : null;

  type Row =
    | {
        label: string;
        value: React.ReactNode;
        mono?: boolean;
      }
    | null;

  const rows: Row[] = [
    product.publisher
      ? {
          label: "Yayınevi",
          value: (
            <Link
              href={`/yayinevleri/${product.publisher.slug}`}
              className="inline-flex items-center gap-1 font-medium text-neutral-900 hover:text-brand-gold-dark"
            >
              {product.publisher.name}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          ),
        }
      : null,
    product.category
      ? {
          label: "Kategori",
          value: (
            <Link
              href={`/kategoriler/${product.category.slug}`}
              className="inline-flex items-center gap-1 font-medium text-neutral-900 hover:text-brand-gold-dark"
            >
              {product.category.name}
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          ),
        }
      : null,
    product.language
      ? { label: "Dil", value: product.language }
      : null,
    showAnaTur ? { label: "Ana Kategori", value: showAnaTur } : null,
    product.detayTur ? { label: "Alt Kategori", value: product.detayTur } : null,
    product.productType ? { label: "Ürün Tipi", value: product.productType } : null,
    product.nameEn
      ? { label: "Ingilizce Adi", value: product.nameEn }
      : null,
    { label: "ISBN / Ürün Kodu", value: product.sku, mono: true },
    { label: "KDV Orani", value: `%${product.vatRate}` },
  ];
  const visible = rows.filter((r): r is NonNullable<Row> => r !== null);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <dl className="divide-y divide-neutral-100">
        {visible.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "grid grid-cols-[minmax(8rem,40%)_1fr] gap-4 px-4 py-3 text-sm sm:px-6",
              i % 2 === 1 && "bg-neutral-50/50"
            )}
          >
            <dt className="text-neutral-500">{r.label}</dt>
            <dd
              className={cn(
                "min-w-0 break-words text-neutral-900",
                r.mono && "font-mono text-[13px]"
              )}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
