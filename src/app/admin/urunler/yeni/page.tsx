import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";

export const metadata: Metadata = { title: "Yeni Urun - Admin" };

const EMPTY: ProductFormValues = {
  name: "",
  nameEn: "",
  sku: "",
  price: "",
  oldPrice: "",
  vatRate: "0",
  stockQuantity: "0",
  publisherId: "",
  categoryId: "",
  anaTur: "",
  detayTur: "",
  language: "",
  productType: "",
  discountGroup: "",
  authorCode: "",
  isPublished: true,
};

export default async function NewProductPage() {
  const [publishers, categories] = await Promise.all([
    prisma.publisher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/urunler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Urunler
        </Link>
      </div>
      <h1 className="text-2xl font-display font-bold text-brand-black">Yeni Urun</h1>
      <ProductForm
        mode="create"
        initial={EMPTY}
        publishers={publishers}
        categories={categories}
      />
    </div>
  );
}
