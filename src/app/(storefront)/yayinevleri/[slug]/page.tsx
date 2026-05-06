import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PRODUCTS_PER_PAGE } from "@/lib/constants";
import { ProductGrid } from "@/components/products/product-grid";
import { Pagination } from "@/components/ui/pagination";
import { ProductFilters } from "@/components/products/product-filters";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { productImageUrl } from "@/lib/images";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    sayfa?: string;
    ara?: string;
    kategori?: string;
    dil?: string;
    tur?: string;
    siralama?: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const publisher = await prisma.publisher.findUnique({
    where: { slug },
    select: { name: true },
  });
  if (!publisher) return { title: "Yayinevi bulunamadi" };
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  return {
    title: `${publisher.name} Kitaplari`,
    description: `${publisher.name} yayinevinin tum kitaplari Master Education'da.`,
    alternates: { canonical: `${baseUrl}/yayinevleri/${slug}` },
  };
}

export default async function PublisherPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const publisher = await prisma.publisher.findUnique({ where: { slug } });
  if (!publisher) notFound();

  const page = Math.max(1, parseInt(sp.sayfa || "1"));
  const search = sp.ara || "";
  const categorySlug = sp.kategori || "";
  const language = sp.dil || "";
  const productType = sp.tur || "";
  const sort = sp.siralama || "yeni";

  const where: Record<string, unknown> = {
    isPublished: true,
    publisherId: publisher.id,
  };
  if (search) where.name = { contains: search, mode: "insensitive" };
  if (categorySlug) where.category = { slug: categorySlug };
  if (language) where.language = language;
  if (productType) where.productType = productType;

  type OrderBy =
    | { price: "asc" | "desc" }
    | { name: "asc" }
    | { createdAt: "desc" }
    | { orderItems: { _count: "desc" } };
  let orderBy: OrderBy;
  switch (sort) {
    case "fiyat-artan":
      orderBy = { price: "asc" };
      break;
    case "fiyat-azalan":
      orderBy = { price: "desc" };
      break;
    case "isim":
      orderBy = { name: "asc" };
      break;
    case "cok-satan":
      orderBy = { orderItems: { _count: "desc" } };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const listSelect = {
    id: true,
    name: true,
    slug: true,
    price: true,
    oldPrice: true,
    sku: true,
    stockQuantity: true,
    hasImage: true,
    publisherId: true,
    categoryId: true,
    discountGroup: true,
    createdAt: true,
    publisher: { select: { name: true } },
    images: {
      orderBy: { displayOrder: "asc" as const },
      take: 1,
      select: { filename: true },
    },
  };

  const [totalCount, products, publishers, categories, languages, productTypes] =
    await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: listSelect,
        orderBy,
        skip: (page - 1) * PRODUCTS_PER_PAGE,
        take: PRODUCTS_PER_PAGE,
      }),
      prisma.publisher.findMany({ orderBy: { name: "asc" } }),
      prisma.category.findMany({ where: { type: "ana" }, orderBy: { name: "asc" } }),
      prisma.product.findMany({
        where: { isPublished: true, language: { not: null } },
        select: { language: true },
        distinct: ["language"],
      }),
      prisma.product.findMany({
        where: { isPublished: true, productType: { not: null } },
        select: { productType: true },
        distinct: ["productType"],
      }),
    ]);

  const totalPages = Math.ceil(totalCount / PRODUCTS_PER_PAGE);

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

  const mapped = products.map((p) => {
    const pricing = priceById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: Number(p.price),
      oldPrice: p.oldPrice ? Number(p.oldPrice) : null,
      dealerPrice: pricing?.dealerPrice ?? null,
      dealerDiscountPct: pricing?.dealerDiscountPct ?? null,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      hasImage: p.hasImage,
      publisherName: p.publisher?.name || null,
      imageSrc: p.images[0] ? productImageUrl(p.images[0].filename) : null,
    };
  });

  const currentParams: Record<string, string> = {};
  if (search) currentParams.ara = search;
  if (categorySlug) currentParams.kategori = categorySlug;
  if (language) currentParams.dil = language;
  if (productType) currentParams.tur = productType;
  if (sort !== "yeni") currentParams.siralama = sort;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <nav className="flex items-center gap-2 text-sm text-brand-muted mb-6">
        <Link href="/" className="hover:text-brand-black">Anasayfa</Link>
        <span>/</span>
        <Link href="/urunler" className="hover:text-brand-black">Urunler</Link>
        <span>/</span>
        <span className="text-brand-black">{publisher.name}</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
          {publisher.name}
        </h1>
        <p className="text-brand-muted text-sm">
          {totalCount.toLocaleString("tr-TR")} urun
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:w-64 shrink-0">
          <ProductFilters
            publishers={publishers}
            categories={categories}
            languages={languages.map((l) => l.language!).filter(Boolean)}
            productTypes={productTypes.map((t) => t.productType!).filter(Boolean)}
            currentFilters={{
              search,
              publisherSlug: slug,
              categorySlug,
              language,
              productType,
              sort,
              minPrice: "",
              maxPrice: "",
              inStockOnly: false,
              discountOnly: false,
            }}
          />
        </aside>
        <div className="flex-1">
          <ProductGrid products={mapped} />
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl={`/yayinevleri/${slug}`}
            searchParams={currentParams}
          />
        </div>
      </div>
    </div>
  );
}
