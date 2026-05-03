import { prisma } from "@/lib/prisma";
import { PRODUCTS_PER_PAGE } from "@/lib/constants";
import { ProductGrid } from "@/components/products/product-grid";
import { Pagination } from "@/components/ui/pagination";
import { ProductFilters } from "@/components/products/product-filters";
import { ActiveFilterChips } from "@/components/products/active-filter-chips";
import { SortSelect } from "@/components/products/sort-select";
import {
  applyDealerPricing,
  getSessionPricingContext,
} from "@/lib/session-pricing";
import { getProductRatings } from "@/lib/product-ratings";
import { searchProductIds } from "@/lib/search";
import { productImageUrl } from "@/lib/images";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Urunler",
};

interface PageProps {
  searchParams: Promise<{
    sayfa?: string;
    ara?: string;
    yayinevi?: string;
    kategori?: string;
    dil?: string;
    tur?: string;
    siralama?: string;
    min?: string;
    max?: string;
    stok?: string;
    indirim?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const search = params.ara || "";
  const publisherSlug = params.yayinevi || "";
  const categorySlug = params.kategori || "";
  const language = params.dil || "";
  const productType = params.tur || "";
  const sort = params.siralama || "yeni";
  const minPrice = params.min || "";
  const maxPrice = params.max || "";
  const inStockOnly = params.stok === "1";
  const discountOnly = params.indirim === "1";

  const where: Record<string, unknown> = { isPublished: true };

  // Birden fazla ID kaynagi (arama + indirim) varsa kesisim aliniyor.
  const idSources: string[][] = [];

  if (discountOnly) {
    // Gercek indirim: oldPrice set edilmis VE guncel fiyattan yuksek.
    // Prisma alan-alan karsilastirma yapamadigindan raw query ile ID cekiyoruz.
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "products"
      WHERE "isPublished" = true
        AND "oldPrice" IS NOT NULL
        AND "oldPrice" > price
    `;
    idSources.push(rows.map((r) => r.id));
  }

  let searchIds: string[] | null = null;
  if (search && search.length >= 2) {
    const hit = await searchProductIds(search, { limit: 1000 });
    searchIds = hit.ids;
    idSources.push(searchIds);
  }

  if (idSources.length > 0) {
    let intersect = idSources[0];
    for (let i = 1; i < idSources.length; i++) {
      const set = new Set(idSources[i]);
      intersect = intersect.filter((id) => set.has(id));
    }
    where.id = { in: intersect.length === 0 ? [] : intersect };
  }
  if (publisherSlug) where.publisher = { slug: publisherSlug };
  if (categorySlug) where.category = { slug: categorySlug };
  if (language) where.language = language;
  if (productType) where.productType = productType;
  if (minPrice || maxPrice) {
    const price: Record<string, number> = {};
    if (minPrice) price.gte = Number(minPrice);
    if (maxPrice) price.lte = Number(maxPrice);
    where.price = price;
  }
  if (inStockOnly) where.stockQuantity = { gt: 0 };

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

  // Liste gorunumunde gosterilen alanlar — `select` ile sinirlarsak DB
  // daha az satir okur ve JSON seri hale getirme de hizlanir.
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
  const inStockWhere = { ...where, stockQuantity: { gt: 0 } };
  const outOfStockWhere = { ...where, stockQuantity: { lte: 0 } };

  const [inStockCount, totalCount, publishers, categories, languages, productTypes] =
    await Promise.all([
      prisma.product.count({ where: inStockWhere }),
      prisma.product.count({ where }),
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

  const skip = (page - 1) * PRODUCTS_PER_PAGE;
  const take = PRODUCTS_PER_PAGE;

  async function fetchSlice(
    sliceWhere: typeof where,
    sliceSkip: number,
    sliceTake: number
  ) {
    return prisma.product.findMany({
      where: sliceWhere,
      select: listSelect,
      orderBy,
      skip: sliceSkip,
      take: sliceTake,
    });
  }

  let products: Awaited<ReturnType<typeof fetchSlice>> = [];
  if (inStockOnly) {
    products = await fetchSlice(inStockWhere, skip, take);
  } else if (skip < inStockCount) {
    const inStockTake = Math.min(take, inStockCount - skip);
    products = await fetchSlice(inStockWhere, skip, inStockTake);
    const remaining = take - inStockTake;
    if (remaining > 0) {
      const outOfStockProducts = await fetchSlice(outOfStockWhere, 0, remaining);
      products = [...products, ...outOfStockProducts];
    }
  } else {
    products = await fetchSlice(outOfStockWhere, skip - inStockCount, take);
  }

  const totalPages = Math.ceil(totalCount / PRODUCTS_PER_PAGE);

  const pricingCtx = await getSessionPricingContext();
  const [priced, ratings] = await Promise.all([
    Promise.resolve(
      applyDealerPricing(
        products.map((p) => ({
          id: p.id,
          price: Number(p.price),
          categoryId: p.categoryId,
          publisherId: p.publisherId,
          discountGroup: p.discountGroup,
        })),
        pricingCtx
      )
    ),
    getProductRatings(products.map((p) => p.id)),
  ]);
  const pricingById = new Map(priced.map((p) => [p.id, p]));

  const mappedProducts = products.map((p) => {
    const pricing = pricingById.get(p.id);
    const r = ratings.get(p.id);
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
      avgRating: r?.avg ?? null,
      reviewCount: r?.count ?? 0,
      createdAt: p.createdAt,
    };
  });

  const currentParams: Record<string, string> = {};
  if (search) currentParams.ara = search;
  if (publisherSlug) currentParams.yayinevi = publisherSlug;
  if (categorySlug) currentParams.kategori = categorySlug;
  if (language) currentParams.dil = language;
  if (productType) currentParams.tur = productType;
  if (sort !== "yeni") currentParams.siralama = sort;
  if (minPrice) currentParams.min = minPrice;
  if (maxPrice) currentParams.max = maxPrice;
  if (inStockOnly) currentParams.stok = "1";
  if (discountOnly) currentParams.indirim = "1";

  const selectedPublisher = publishers.find((p) => p.slug === publisherSlug);
  const selectedCategory = categories.find((c) => c.slug === categorySlug);

  const chips: { key: string; label: string; urlKey: string }[] = [];
  if (search) chips.push({ key: "search", label: `Ara: ${search}`, urlKey: "ara" });
  if (selectedCategory)
    chips.push({ key: "cat", label: selectedCategory.name, urlKey: "kategori" });
  if (selectedPublisher)
    chips.push({ key: "pub", label: selectedPublisher.name, urlKey: "yayinevi" });
  if (language) chips.push({ key: "lang", label: language, urlKey: "dil" });
  if (productType) chips.push({ key: "type", label: productType, urlKey: "tur" });
  if (minPrice || maxPrice) {
    chips.push({
      key: "price",
      label: `${minPrice || "0"} - ${maxPrice || "∞"} TL`,
      urlKey: minPrice ? "min" : "max",
    });
  }
  if (inStockOnly)
    chips.push({ key: "stock", label: "Stokta olan", urlKey: "stok" });
  if (discountOnly)
    chips.push({ key: "discount", label: "Indirimli", urlKey: "indirim" });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-neutral-900 sm:text-3xl">
            {selectedCategory?.name ?? selectedPublisher?.name ?? "Tum Urunler"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {totalCount.toLocaleString("tr-TR")} urun bulundu
            {inStockCount > 0 && inStockCount !== totalCount && (
              <span className="ml-1 text-neutral-400">
                ({inStockCount.toLocaleString("tr-TR")} stokta)
              </span>
            )}
          </p>
        </div>
        <SortSelect current={sort} />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Sidebar */}
        <aside className="lg:w-64 lg:shrink-0">
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <ProductFilters
              publishers={publishers}
              categories={categories}
              languages={languages.map((l) => l.language!).filter(Boolean)}
              productTypes={productTypes.map((t) => t.productType!).filter(Boolean)}
              currentFilters={{
                search,
                publisherSlug,
                categorySlug,
                language,
                productType,
                sort,
                minPrice,
                maxPrice,
                inStockOnly,
                discountOnly,
              }}
            />
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <ActiveFilterChips chips={chips} baseParams={currentParams} />
          <ProductGrid products={mappedProducts} />
          <div className="mt-8">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              baseUrl="/urunler"
              searchParams={currentParams}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
