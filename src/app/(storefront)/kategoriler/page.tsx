import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CATEGORY_ICONS } from "@/components/layout/category-menu";
import { ArrowRightIcon, BookOpenIcon } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Kategoriler",
  description:
    "Master Education kategorileri — ELT, DaF, MEB ve diger egitim materyali kategorilerine gozat.",
};

export default async function CategoriesIndexPage() {
  const categories = await prisma.category.findMany({
    where: { type: "ana" },
    select: {
      slug: true,
      name: true,
      _count: { select: { products: { where: { isPublished: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const totalProducts = categories.reduce((sum, c) => sum + c._count.products, 0);
  const withProducts = categories.filter((c) => c._count.products > 0);

  return (
    <div className="bg-neutral-50">
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-white">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-32 top-0 h-[400px] w-[500px] rounded-full bg-gradient-to-br from-amber-100/60 to-transparent blur-3xl" />
          <div className="absolute -right-32 top-20 h-[400px] w-[500px] rounded-full bg-gradient-to-br from-rose-100/40 to-transparent blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.3em] text-neutral-500">
            <span className="h-px w-10 bg-neutral-300" />
            <span>Kesfedin</span>
          </div>
          <h1 className="font-display text-4xl font-black leading-[1.05] tracking-[-0.03em] text-neutral-950 sm:text-5xl md:text-6xl">
            Kategoriler
          </h1>
          <p className="mt-4 max-w-2xl text-base text-neutral-600 sm:text-lg">
            <span className="font-semibold text-neutral-900">{withProducts.length}</span>{" "}
            kategori, toplam{" "}
            <span className="font-semibold text-neutral-900">
              {totalProducts.toLocaleString("tr-TR")}
            </span>{" "}
            urun. Dilinize ve seviyenize uygun materyalleri bulun.
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        {withProducts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center">
            <BookOpenIcon className="mx-auto h-12 w-12 text-neutral-300" />
            <p className="mt-4 text-sm text-neutral-500">
              Henuz aktif kategori yok.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
            {withProducts.map((c) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? BookOpenIcon;
              return (
                <Link
                  key={c.slug}
                  href={`/kategoriler/${c.slug}`}
                  className="group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-lg"
                >
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-gold-light/0 blur-2xl transition-all group-hover:bg-brand-gold-light/40" />
                  <div className="relative">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gold-light text-neutral-900 transition-colors group-hover:bg-brand-gold">
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="relative mt-4">
                    <p className="font-display text-base font-bold tracking-tight text-neutral-950">
                      {c.name}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">
                        {c._count.products.toLocaleString("tr-TR")} urun
                      </span>
                      <ArrowRightIcon className="h-3.5 w-3.5 text-neutral-400 transition-all group-hover:translate-x-0.5 group-hover:text-brand-gold-dark" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
