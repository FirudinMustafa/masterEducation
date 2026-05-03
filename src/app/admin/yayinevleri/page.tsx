import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";

export const metadata: Metadata = { title: "Yayinevleri - Admin" };

export default async function AdminPublishersPage() {
  const publishers = await prisma.publisher.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  const items = publishers.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    productCount: p._count.products,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Yayinevleri
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Yayinevlerini yonetin. Urunler veya iskonto kurallari baglandigi surece
          silinemez.
        </p>
      </div>
      <TaxonomyManager kind="publisher" items={items} />
    </div>
  );
}
