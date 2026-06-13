import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";
import { ProductsFilterBar } from "@/components/admin/products-filter-bar";
import { ADMIN_PRODUCTS_PER_PAGE } from "@/lib/constants";

export const metadata: Metadata = { title: "Ürünler - Admin" };

interface PageProps {
  searchParams: Promise<{
    sayfa?: string;
    ara?: string;
    stokMin?: string;
    stokMax?: string;
    kategori?: string;
    yayinevi?: string;
  }>;
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const search = params.ara || "";
  const perPage = ADMIN_PRODUCTS_PER_PAGE;

  const where: Record<string, unknown> = {};
  if (search) {
    // Ad, ISBN (sku) ve yazar koduna göre arama.
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { authorCode: { contains: search, mode: "insensitive" } },
    ];
  }

  // Stok sayısal aralık filtresi (boş bırakılan uç uygulanmaz).
  const stokMin = params.stokMin ? parseInt(params.stokMin) : null;
  const stokMax = params.stokMax ? parseInt(params.stokMax) : null;
  const stockFilter: Record<string, number> = {};
  if (stokMin !== null && Number.isFinite(stokMin)) stockFilter.gte = stokMin;
  if (stokMax !== null && Number.isFinite(stokMax)) stockFilter.lte = stokMax;
  if (Object.keys(stockFilter).length > 0) where.stockQuantity = stockFilter;

  // Kategori / yayınevi filtresi (dropdown'dan gelen id).
  if (params.kategori) where.categoryId = params.kategori;
  if (params.yayinevi) where.publisherId = params.yayinevi;

  const [products, total, categories, publishers] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        price: true,
        stockQuantity: true,
        isPublished: true,
        publisher: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.product.count({ where }),
    prisma.category.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    prisma.publisher.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  // Sayfalama linkleri aktif filtreleri korur.
  const pageQuery = (p: number) => {
    const qs = new URLSearchParams();
    qs.set("sayfa", String(p));
    if (search) qs.set("ara", search);
    if (params.stokMin) qs.set("stokMin", params.stokMin);
    if (params.stokMax) qs.set("stokMax", params.stokMax);
    if (params.kategori) qs.set("kategori", params.kategori);
    if (params.yayinevi) qs.set("yayinevi", params.yayinevi);
    return qs.toString();
  };

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    publisherName: p.publisher?.name ?? null,
    categoryName: p.category?.name ?? null,
    price: Number(p.price),
    stockQuantity: p.stockQuantity,
    isPublished: p.isPublished,
  }));

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            Ürünler
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString("tr-TR")} ürün
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/urunler/toplu-fiyat"
            className="px-4 py-2 bg-white border border-gray-200 text-brand-black rounded-lg text-sm font-semibold hover:bg-gray-50"
          >
            Toplu Fiyat
          </Link>
          <Link
            href="/admin/urunler/toplu-gorsel"
            className="px-4 py-2 bg-white border border-gray-200 text-brand-black rounded-lg text-sm font-semibold hover:bg-gray-50"
          >
            Toplu Görsel
          </Link>
          <Link
            href="/admin/urunler/toplu-yukleme"
            className="px-4 py-2 bg-white border border-gray-200 text-brand-black rounded-lg text-sm font-semibold hover:bg-gray-50"
          >
            Toplu Yükle
          </Link>
          <Link
            href="/admin/urunler/yeni"
            className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark"
          >
            + Yeni Ürün
          </Link>
        </div>
      </div>

      <ProductsFilterBar categories={categories} publishers={publishers} />

      <ProductsTable
        products={rows}
        categories={categories}
        publishers={publishers}
      />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <p className="text-sm text-gray-500">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/urunler?${pageQuery(page - 1)}`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Önceki
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/urunler?${pageQuery(page + 1)}`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Sonraki
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
