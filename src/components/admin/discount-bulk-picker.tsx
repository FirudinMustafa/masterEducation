"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/stores/toast-store";

interface Publisher {
  id: string;
  name: string;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  price: number;
  publisherName: string | null;
}

interface Props {
  dealerId: string;
  publishers: Publisher[];
  onDone: () => void;
}

// Admin "bir bayiye 100 ürüne iskonto ver" akisi:
//   1) Yayınevi/kategori/ISBN ile filtrele
//   2) Checkbox ile seç (sayfa bazli veya "tümunu seç")
//   3) Tek bir yuzde gir (veya her satir icin inline yuzde)
//   4) Kaydet → PRODUCT scope kurallari upsert.
export function DiscountBulkPicker({ dealerId, publishers, onDone }: Props) {
  const [publisherId, setPublisherId] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState("");
  const [perRowPct, setPerRowPct] = useState<Record<string, string>>({});
  const [perRowMode, setPerRowMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search effect; setRows([]) clear path debounce başlamadan
  // listeyi temizliyor — React 19 default uyarısı bu pattern için titiz.
  useEffect(() => {
    if (!publisherId && query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (publisherId) params.set("publisherId", publisherId);
      if (query.trim().length >= 2) params.set("q", query.trim());
      params.set("limit", "200");
      try {
        const res = await fetch(`/api/admin/products/search?${params}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { products: ProductRow[] };
          setRows(data.products);
        }
      } catch {}
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [publisherId, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  }

  const summary = useMemo(() => {
    if (selected.size === 0) return null;
    if (perRowMode) {
      const pcts = [...selected]
        .map((id) => Number(perRowPct[id]))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (pcts.length === 0) return `${selected.size} secili, yuzde girilmedi`;
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      return `${selected.size} secili · ort %${avg.toFixed(1)}`;
    }
    return `${selected.size} ürüne %${pct || 0} uygulanacak`;
  }, [selected, pct, perRowMode, perRowPct]);

  async function save() {
    setError(null);
    const items: Array<{ productId: string; discountPct: number }> = [];
    for (const id of selected) {
      let value: number;
      if (perRowMode) {
        value = Number(perRowPct[id]);
        if (!Number.isFinite(value) || value < 0 || value > 100) continue;
      } else {
        value = Number(pct);
      }
      items.push({ productId: id, discountPct: value });
    }
    if (items.length === 0) {
      setError("Kaydedilecek ürün yok (yuzdeleri kontrol edin).");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/discounts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, items }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Kayıt başarısız.");
      return;
    }
    const data = (await res.json()) as { upserted: number };
    toast.success(`${data.upserted} ürüne iskonto atandi`);
    setSelected(new Set());
    setPerRowPct({});
    setPct("");
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-brand-black mb-1">Toplu Ürün İskontosu</h3>
        <p className="text-xs text-gray-500 mb-4">
          Yayınevi veya ISBN ile filtreleyin, listeden ürünleri isaretleyin ve hepsine ayni yuzdeyi verin — ya da her ürüne farkli yuzde girin.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Yayınevi</span>
            <select
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Tüm yayınevleri</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Ürün ara (ad veya ISBN)
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="En az 2 karakter..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            {loading
              ? "Yükleniyor..."
              : rows.length > 0
                ? `${rows.length} ürün bulundu (ilk 200)`
                : "Sonuc yok"}
          </span>
          {rows.length > 0 && (
            <button
              onClick={toggleAll}
              className="text-xs text-brand-gold-dark hover:underline cursor-pointer"
            >
              {selected.size === rows.length ? "Secimi kaldir" : "Tümunu seç"}
            </button>
          )}
        </div>

        <div className="border border-gray-200 rounded-lg max-h-[400px] overflow-y-auto">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-gray-400 text-center">
              Listeyi gormek icin yayınevi secin veya ISBN ile arayin.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="text-left p-2 text-xs font-semibold text-gray-500">Ürün</th>
                  <th className="text-left p-2 text-xs font-semibold text-gray-500 w-24">ISBN</th>
                  <th className="text-right p-2 text-xs font-semibold text-gray-500 w-20">Fiyat</th>
                  {perRowMode && (
                    <th className="text-right p-2 text-xs font-semibold text-gray-500 w-20">
                      %
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-gray-50 hover:bg-gray-50/60 ${
                      selected.has(r.id) ? "bg-brand-gold-light/30" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="p-2 text-gray-800">
                      <p className="line-clamp-1">{r.name}</p>
                      {r.publisherName && (
                        <p className="text-xs text-gray-500">{r.publisherName}</p>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs text-gray-600">{r.sku}</td>
                    <td className="p-2 text-right font-medium">
                      {r.price.toFixed(2)}
                    </td>
                    {perRowMode && (
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={perRowPct[r.id] ?? ""}
                          onChange={(e) =>
                            setPerRowPct((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          disabled={!selected.has(r.id)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-right disabled:bg-gray-50"
                          placeholder="—"
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-brand-black">İskonto Uygula</h4>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={perRowMode}
              onChange={(e) => setPerRowMode(e.target.checked)}
            />
            Her ürüne farkli yuzde ver
          </label>
        </div>

        {!perRowMode && (
          <div className="flex items-end gap-3">
            <label className="block flex-1 max-w-[200px]">
              <span className="block text-xs font-medium text-gray-500 mb-1">
                Yuzde (hepsine)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="Orn: 15"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {summary && (
            <p className="text-sm text-gray-600">
              <strong>{summary}</strong>
            </p>
          )}
          <button
            onClick={save}
            disabled={
              selected.size === 0 ||
              saving ||
              (!perRowMode && (!pct || Number(pct) < 0))
            }
            className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Kaydediliyor..." : `Kaydet (${selected.size})`}
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
