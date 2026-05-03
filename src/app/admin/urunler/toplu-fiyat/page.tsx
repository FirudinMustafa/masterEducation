import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import Link from "next/link";
import { BulkPriceForm } from "@/components/admin/bulk-price-form";

export const metadata: Metadata = { title: "Toplu Fiyat - Admin" };

export default async function BulkPricePage() {
  const [publishers, categories, groupsRaw] = await Promise.all([
    prisma.publisher.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    prisma.product.findMany({
      where: { discountGroup: { not: null } },
      select: { discountGroup: true },
      distinct: ["discountGroup"],
    }),
  ]);

  const discountGroups = groupsRaw
    .map((g) => g.discountGroup)
    .filter((v): v is string => !!v)
    .sort();

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href="/admin/urunler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Urunler
        </Link>
        <h1 className="text-2xl font-display font-bold text-brand-black mt-2">
          Toplu Fiyat Guncelle
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Filtre ile bir ürün grubunu seç → tek fiyat ata, % artır/azalt veya
          sabit miktar ekle/çıkar. <strong>Önce önizleme</strong> sonra uygula.
        </p>
      </div>

      <BulkPriceForm
        publishers={publishers}
        categories={categories}
        discountGroups={discountGroups}
      />
    </div>
  );
}
