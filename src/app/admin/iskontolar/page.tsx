import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { DiscountManager } from "@/components/admin/discount-manager";
import { AdminSearchBar } from "@/components/admin/search-bar";

export const metadata: Metadata = { title: "Iskontolar - Admin" };

interface PageProps {
  searchParams: Promise<{ bayi?: string; ara?: string }>;
}

export default async function AdminDiscountsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const dealerId = params.bayi ?? "";
  const search = params.ara?.trim() ?? "";

  const dealers = await prisma.dealer.findMany({
    where: {
      status: "APPROVED",
      ...(search
        ? {
            OR: [
              { companyName: { contains: search, mode: "insensitive" } },
              { taxNumber: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      companyName: true,
      taxNumber: true,
      discountRules: { select: { discountPct: true } },
    },
    orderBy: { companyName: "asc" },
  });

  if (!dealerId) {
    const totalRules = dealers.reduce((s, d) => s + d.discountRules.length, 0);
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-display font-bold text-brand-black mb-1">Iskontolar</h1>
        <p className="text-sm text-gray-500 mb-4">
          {dealers.length} onayli bayi · {totalRules} toplam kural
        </p>
        <AdminSearchBar
          defaultValue={search}
          placeholder="Bayi adi veya vergi no ile ara..."
        />
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <p className="text-sm text-gray-600 mb-3">
            Iskonto kurallarini yonetmek icin bir bayi secin.
          </p>
          <ul className="divide-y divide-gray-100">
            {dealers.map((d) => {
              const n = d.discountRules.length;
              const avg =
                n > 0
                  ? d.discountRules.reduce((s, r) => s + Number(r.discountPct), 0) / n
                  : 0;
              return (
                <li key={d.id} className="py-3 flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/iskontolar?bayi=${d.id}`}
                    className="min-w-0 flex-1 text-brand-black hover:text-brand-gold-dark font-medium truncate"
                  >
                    {d.companyName}
                  </Link>
                  <div className="flex items-center gap-3 text-xs">
                    <span
                      className={
                        n > 0
                          ? "px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold"
                          : "px-2 py-1 rounded-md bg-gray-100 text-gray-500"
                      }
                    >
                      {n} kural
                    </span>
                    {n > 0 && (
                      <span className="text-gray-500">ort %{avg.toFixed(1)}</span>
                    )}
                    <span className="text-gray-400 font-mono w-28 text-right hidden sm:inline">
                      {d.taxNumber}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          {dealers.length === 0 && (
            <p className="text-sm text-gray-500">
              {search ? `"${search}" icin sonuc yok.` : "Onaylanmis bayi yok."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, companyName: true },
  });

  if (!dealer) {
    return (
      <div className="max-w-4xl">
        <p className="text-sm text-red-600">Bayi bulunamadi.</p>
      </div>
    );
  }

  const [rules, publishers, categories, groupsRaw, otherDealers] = await Promise.all([
    prisma.dealerDiscount.findMany({
      where: { dealerId },
      include: {
        dealer: { select: { companyName: true } },
        product: { select: { name: true, sku: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.publisher.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true },
    }),
    prisma.product.findMany({
      where: { discountGroup: { not: null } },
      select: { discountGroup: true },
      distinct: ["discountGroup"],
    }),
    prisma.dealer.findMany({
      where: { status: "APPROVED", id: { not: dealerId } },
      select: {
        id: true,
        companyName: true,
        _count: { select: { discountRules: true } },
      },
      orderBy: { companyName: "asc" },
    }),
  ]);

  const discountGroups = groupsRaw
    .map((g) => g.discountGroup)
    .filter((v): v is string => !!v)
    .sort();

  const rulesPlain = rules.map((r) => ({
    id: r.id,
    scope: r.scope,
    discountPct: Number(r.discountPct),
    productId: r.productId,
    categoryId: r.categoryId,
    publisherId: r.publisherId,
    discountGroup: r.discountGroup,
    product: r.product,
    category: r.category,
    dealer: r.dealer,
  }));

  const otherDealersPlain = otherDealers.map((d) => ({
    id: d.id,
    companyName: d.companyName,
    ruleCount: d._count.discountRules,
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/iskontolar" className="text-sm text-gray-500 hover:text-brand-black">
          &larr; Bayi secimi
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          {dealer.companyName}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Iskonto Kurallari</p>
      </div>

      <DiscountManager
        dealerId={dealer.id}
        dealerName={dealer.companyName}
        rules={rulesPlain}
        publishers={publishers}
        categories={categories}
        discountGroups={discountGroups}
        otherDealers={otherDealersPlain}
      />
    </div>
  );
}
