import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TaxonomyManager } from "@/components/admin/taxonomy-manager";

export const metadata: Metadata = { title: "Kategoriler - Admin" };

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const items = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    productCount: c._count.products,
    type: (c.type === "detay" ? "detay" : "ana") as "ana" | "detay",
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Kategoriler
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ürün kategorilerini yonetin. &quot;Ana&quot; kategoriler magaza menulerinde
          gösterilir.
        </p>
      </div>
      <TaxonomyManager kind="category" items={items} />
    </div>
  );
}
