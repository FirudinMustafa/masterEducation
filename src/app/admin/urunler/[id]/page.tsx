import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { ProductImagesManager } from "@/components/admin/product-images-manager";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Ürün Duzenle - Admin" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: PageProps) {
  const { id } = await params;
  const [product, publishers, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        images: {
          select: { id: true, filename: true, displayOrder: true },
          orderBy: [{ displayOrder: "asc" }, { pictureId: "asc" }],
        },
      },
    }),
    prisma.publisher.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!product) notFound();

  const initial: ProductFormValues = {
    name: product.name,
    sku: product.sku,
    price: String(Number(product.price)),
    oldPrice: product.oldPrice ? String(Number(product.oldPrice)) : "",
    vatRate: String(Number(product.vatRate)),
    stockQuantity: String(product.stockQuantity),
    publisherId: product.publisherId ?? "",
    categoryId: product.categoryId ?? "",
    anaTur: product.anaTur ?? "",
    detayTur: product.detayTur ?? "",
    language: product.language ?? "",
    productType: product.productType ?? "",
    discountGroup: product.discountGroup ?? "",
    authorCode: product.authorCode ?? "",
    isPublished: product.isPublished,
  };

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/urunler"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Ürünler
        </Link>
      </div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            {product.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ISBN: <span className="font-mono">{product.sku}</span> · Liste fiyati:{" "}
            {formatPrice(Number(product.price))}
          </p>
        </div>
        <Link
          href={`/urunler/${product.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-gold-dark hover:underline"
        >
          Magazada göster &rarr;
        </Link>
      </div>

      <ProductImagesManager productId={product.id} images={product.images} />

      <ProductForm
        mode="edit"
        productId={product.id}
        initial={initial}
        publishers={publishers}
        categories={categories}
      />
    </div>
  );
}
