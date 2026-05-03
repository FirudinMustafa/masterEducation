import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { DiscountScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Iskontolarim - Bayi Paneli" };

const SCOPE_LABELS: Record<DiscountScope, string> = {
  PRODUCT: "Urun Bazli",
  CATEGORY: "Kategori Bazli",
  DISCOUNT_GROUP: "Iskonto Grubu",
  PUBLISHER: "Yayinevi Bazli",
  GLOBAL: "Tum Urunler",
};

const SCOPE_ORDER: DiscountScope[] = [
  "PRODUCT",
  "CATEGORY",
  "DISCOUNT_GROUP",
  "PUBLISHER",
  "GLOBAL",
];

export default async function DealerDiscountsPage() {
  const session = await auth();
  if (!session?.user?.dealerId) redirect("/giris");
  const dealerId = session.user.dealerId;

  const rules = await prisma.dealerDiscount.findMany({
    where: { dealerId },
    include: {
      product: { select: { name: true, sku: true } },
      category: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const publisherIds = [...new Set(rules.map((r) => r.publisherId).filter((v): v is string => !!v))];
  const publisherMap = publisherIds.length
    ? new Map(
        (
          await prisma.publisher.findMany({
            where: { id: { in: publisherIds } },
            select: { id: true, name: true },
          })
        ).map((p) => [p.id, p.name])
      )
    : new Map<string, string>();

  // Group rules by scope so the priority order is visible.
  const grouped = new Map<DiscountScope, typeof rules>();
  for (const r of rules) {
    const arr = grouped.get(r.scope) ?? [];
    arr.push(r);
    grouped.set(r.scope, arr);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Iskontolarim
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Size ozel tanimli iskonto kurallari. Bir urun icin birden fazla kural
          eslesirse{" "}
          <strong>urun &rarr; kategori &rarr; grup &rarr; yayinevi &rarr; global</strong>{" "}
          onceligine gore en spesifik olan uygulanir.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
          Size ozel tanimli bir iskonto bulunmuyor. Daha iyi bir bayi anlasmasi
          icin bizimle iletisime gecin.
        </div>
      ) : (
        SCOPE_ORDER.map((scope) => {
          const items = grouped.get(scope);
          if (!items || items.length === 0) return null;
          return (
            <section key={scope} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-brand-black">
                  {SCOPE_LABELS[scope]}
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500 uppercase text-xs">
                    <th className="text-left p-3">Hedef</th>
                    <th className="text-right p-3">Iskonto</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-gray-50">
                      <td className="p-3">
                        {r.scope === "PRODUCT" && r.product && (
                          <div>
                            <p className="font-medium text-brand-black">
                              {r.product.name}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">
                              {r.product.sku}
                            </p>
                          </div>
                        )}
                        {r.scope === "CATEGORY" && r.category && (
                          <span className="font-medium text-brand-black">
                            {r.category.name}
                          </span>
                        )}
                        {r.scope === "PUBLISHER" && r.publisherId && (
                          <span className="font-medium text-brand-black">
                            {publisherMap.get(r.publisherId) ?? r.publisherId}
                          </span>
                        )}
                        {r.scope === "DISCOUNT_GROUP" && r.discountGroup && (
                          <span className="font-medium text-brand-black">
                            {r.discountGroup}
                          </span>
                        )}
                        {r.scope === "GLOBAL" && (
                          <span className="font-medium text-brand-black">
                            Tum urunler
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-semibold text-emerald-700">
                        %{Number(r.discountPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}

      <div className="text-xs text-gray-500">
        Kurallari yalnizca yonetici tarafindan degistirilebilir. Degisiklik
        talepleriniz icin iletisim ekibimizle gorusun.
      </div>
    </div>
  );
}
