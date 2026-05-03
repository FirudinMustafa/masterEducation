import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";

export const metadata: Metadata = { title: "Urunler - Admin" };

interface PageProps {
  searchParams: Promise<{ sayfa?: string; ara?: string }>;
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const search = params.ara || "";
  const perPage = 20;

  const where: Record<string, unknown> = {};
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

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

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    publisherName: p.publisher?.name ?? null,
    price: Number(p.price),
    stockQuantity: p.stockQuantity,
    isPublished: p.isPublished,
  }));

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            Urunler
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {total.toLocaleString("tr-TR")} urun
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
            Toplu Yukle
          </Link>
          <Link
            href="/admin/urunler/yeni"
            className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark"
          >
            + Yeni Urun
          </Link>
        </div>
      </div>

      <form className="mb-6">
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            name="ara"
            defaultValue={search}
            placeholder="Urun ara..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-brand-gold text-brand-black text-sm font-semibold rounded-lg hover:bg-brand-gold-dark transition-colors cursor-pointer"
          >
            Ara
          </button>
        </div>
      </form>

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
                href={`/admin/urunler?sayfa=${page - 1}${
                  search ? `&ara=${search}` : ""
                }`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Onceki
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/urunler?sayfa=${page + 1}${
                  search ? `&ara=${search}` : ""
                }`}
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
