"use client";

import { useEffect, useState } from "react";
import type { DiscountScope } from "@prisma/client";

interface ProductResult {
  id: string;
  name: string;
  sku: string;
  publisherName: string | null;
}

interface SimResponse {
  product: {
    id: string;
    name: string;
    sku: string;
    publisherName: string | null;
    discountGroup: string | null;
  };
  listPrice: number;
  dealerPrice: number;
  discountPct: number;
  matchedScope: DiscountScope | null;
  applicableRules: Array<{
    scope: DiscountScope;
    discountPct: number;
    productId: string | null;
    publisherId: string | null;
    discountGroup: string | null;
    isWinner: boolean;
  }>;
}

const SCOPE_LABELS: Record<DiscountScope, string> = {
  PRODUCT: "Ürün",
  CATEGORY: "Kategori",
  DISCOUNT_GROUP: "İskonto Grubu",
  PUBLISHER: "Yayınevi",
  GLOBAL: "Tüm Ürünler",
};

export function DiscountSimulator({
  dealerId,
  dealerName,
}: {
  dealerId: string;
  dealerName: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [selected, setSelected] = useState<ProductResult | null>(null);
  const [sim, setSim] = useState<SimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced product search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { products: ProductResult[] };
          setResults(data.products);
        }
      } catch {}
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  async function pickProduct(p: ProductResult) {
    setSelected(p);
    setResults([]);
    setQuery("");
    setError(null);
    setSim(null);
    const res = await fetch("/api/admin/discounts/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, productId: p.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Simulasyon başarısız.");
      return;
    }
    const data = (await res.json()) as SimResponse;
    setSim(data);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-brand-black mb-1">Fiyat Simulatoru</h3>
      <p className="text-xs text-gray-500 mb-4">
        <strong>{dealerName}</strong> bu ürünu alirken kac TL oder, hangi kural uygulanir?
      </p>

      <div className="relative max-w-md">
        {selected ? (
          <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-black truncate">
                {selected.name}
              </p>
              <p className="text-xs text-gray-500">
                ISBN: {selected.sku}
                {selected.publisherName ? ` · ${selected.publisherName}` : ""}
              </p>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setSim(null);
                setError(null);
              }}
              className="text-xs text-red-600 hover:underline cursor-pointer"
            >
              Degistir
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adi veya ISBN..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              autoComplete="off"
            />
            {results.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-1 max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-brand-gold-light/30 cursor-pointer"
                    >
                      <p className="text-sm font-medium text-brand-black line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        ISBN: {p.sku}
                        {p.publisherName ? ` · ${p.publisherName}` : ""}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {sim && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Liste Fiyati" value={`${sim.listPrice.toFixed(2)} TL`} />
            <Stat
              label="Uygulanan İskonto"
              value={sim.discountPct > 0 ? `%${sim.discountPct}` : "Yok"}
              tone={sim.discountPct > 0 ? "success" : "muted"}
            />
            <Stat
              label="Bayi Fiyati"
              value={`${sim.dealerPrice.toFixed(2)} TL`}
              tone="primary"
            />
          </div>

          {sim.matchedScope ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wider mb-1">
                Kazanan kural
              </p>
              <p className="text-sm text-emerald-900">
                <strong>{SCOPE_LABELS[sim.matchedScope]}</strong> kapsami, %{sim.discountPct} iskonto
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Bu bayi icin uyan kural yok — liste fiyati uygulaniyor.
            </div>
          )}

          {sim.applicableRules.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Uygulanabilir tüm kurallar
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2 font-semibold text-gray-600">
                        Kapsam
                      </th>
                      <th className="text-right p-2 font-semibold text-gray-600">%</th>
                      <th className="text-center p-2 font-semibold text-gray-600">
                        Durum
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.applicableRules.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t border-gray-100 ${
                          r.isWinner ? "bg-emerald-50" : ""
                        }`}
                      >
                        <td className="p-2">{SCOPE_LABELS[r.scope]}</td>
                        <td className="p-2 text-right font-medium">
                          %{r.discountPct}
                        </td>
                        <td className="p-2 text-center">
                          {r.isWinner ? (
                            <span className="text-emerald-700 font-semibold">
                              ✓ Kazanan
                            </span>
                          ) : (
                            <span className="text-gray-400">Elendi</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Oncelik sirasi: Ürün &gt; İskonto Grubu &gt; Yayınevi &gt; Tüm Ürünler. En spesifik kural kazanir.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "success" | "muted";
}) {
  const color = {
    default: "text-brand-black",
    primary: "text-brand-gold-dark",
    success: "text-emerald-700",
    muted: "text-gray-400",
  }[tone];
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
