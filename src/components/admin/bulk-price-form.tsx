"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";

type Mode =
  | "set"
  | "percent_increase"
  | "percent_decrease"
  | "fixed_increase"
  | "fixed_decrease";

const MODE_LABELS: Record<Mode, string> = {
  set: "Tek fiyat ata (hepsi aynı olur)",
  percent_increase: "% artır",
  percent_decrease: "% azalt",
  fixed_increase: "Sabit TL ekle",
  fixed_decrease: "Sabit TL çıkar",
};

interface Publisher {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
  type: string;
}

interface PreviewSample {
  id: string;
  name: string;
  sku: string;
  current: number;
  next: number;
}
interface PreviewResp {
  affected: number;
  sample: PreviewSample[];
  summary: {
    minNew: number;
    maxNew: number;
    avgNew: number;
    minOld: number;
    maxOld: number;
  } | null;
  applied: boolean;
  error?: string;
}

interface Props {
  publishers: Publisher[];
  categories: Category[];
  discountGroups: string[];
}

export function BulkPriceForm({
  publishers,
  categories,
  discountGroups,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);

  // Filter
  const [publisherId, setPublisherId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [discountGroup, setDiscountGroup] = useState("");
  const [publishedFilter, setPublishedFilter] = useState<"all" | "yes" | "no">(
    "all"
  );

  // Mode
  const [mode, setMode] = useState<Mode>("set");
  const [value, setValue] = useState("");
  const [minPrice, setMinPrice] = useState("");

  function buildBody(dryRun: boolean) {
    const filter: Record<string, unknown> = {};
    if (publisherId) filter.publisherId = publisherId;
    if (categoryId) filter.categoryId = categoryId;
    if (discountGroup) filter.discountGroup = discountGroup;
    if (publishedFilter === "yes") filter.isPublished = true;
    if (publishedFilter === "no") filter.isPublished = false;

    const body: Record<string, unknown> = {
      filter,
      mode,
      value: Number(value),
      dryRun,
    };
    if (minPrice && (mode === "percent_decrease" || mode === "fixed_decrease")) {
      body.minPrice = Number(minPrice);
    }
    return body;
  }

  async function fetchPreview() {
    setError(null);
    setInfo(null);
    setPreview(null);
    if (!value || Number(value) < 0) {
      setError("Geçerli bir değer girin.");
      return;
    }
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(true)),
    });
    const data = (await res.json()) as PreviewResp;
    if (!res.ok) {
      setError(data.error ?? "Önizleme başarısız.");
      return;
    }
    setPreview(data);
  }

  async function applyChange() {
    if (!preview || preview.affected === 0) return;
    if (
      !confirm(
        `${preview.affected} ürünün fiyatı değiştirilecek. Devam edilsin mi?`
      )
    )
      return;
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/products/bulk-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(false)),
    });
    const data = (await res.json()) as PreviewResp;
    if (!res.ok) {
      setError(data.error ?? "Uygulama başarısız.");
      return;
    }
    setInfo(`${data.affected} ürünün fiyatı güncellendi.`);
    setPreview(null);
    setValue("");
    startTransition(() => router.refresh());
  }

  const isPercent = mode === "percent_increase" || mode === "percent_decrease";
  const showFloor = mode === "percent_decrease" || mode === "fixed_decrease";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      {/* Filter */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-brand-black">1. Hangi ürünler?</h2>
        <p className="text-xs text-gray-500">
          En az bir filtre seç. Boş alanlar tüm değerleri dahil eder.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yayinevi
            </span>
            <select
              value={publisherId}
              onChange={(e) => setPublisherId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">— Tümü —</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Kategori
            </span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">— Tümü —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Iskonto Grubu
            </span>
            <select
              value={discountGroup}
              onChange={(e) => setDiscountGroup(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">— Tümü —</option>
              {discountGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yayin Durumu
            </span>
            <select
              value={publishedFilter}
              onChange={(e) =>
                setPublishedFilter(e.target.value as "all" | "yes" | "no")
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="all">— Tümü —</option>
              <option value="yes">Yalniz aktif</option>
              <option value="no">Yalniz pasif</option>
            </select>
          </label>
        </div>
      </section>

      {/* Mode + Value */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-brand-black">2. Ne yapalım?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Islem
            </span>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setPreview(null);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              {isPercent ? "Yüzde (%)" : "Tutar (TL)"}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setPreview(null);
              }}
              placeholder={isPercent ? "10" : "50"}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          {showFloor && (
            <label className="block md:col-span-2">
              <span className="block text-xs font-medium text-gray-500 mb-1">
                Minimum fiyat (opsiyonel — düşüş bu değerin altına inmez)
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="orn. 1"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </label>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={fetchPreview}
            disabled={pending || !value}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            Önizle
          </button>
        </div>
      </section>

      {/* Preview */}
      {preview && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-black">3. Önizleme</h2>
            <button
              onClick={applyChange}
              disabled={pending || preview.affected === 0}
              className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              Uygula
            </button>
          </div>

          {preview.affected === 0 ? (
            <p className="text-sm text-gray-500">
              Filtreye uyan ürün yok. Filtreyi gevşetin.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Etkilenecek" value={preview.affected.toString()} />
                {preview.summary && (
                  <>
                    <Stat
                      label="Yeni min"
                      value={formatPrice(preview.summary.minNew)}
                    />
                    <Stat
                      label="Yeni max"
                      value={formatPrice(preview.summary.maxNew)}
                    />
                    <Stat
                      label="Yeni ort."
                      value={formatPrice(preview.summary.avgNew)}
                    />
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                      <th className="text-left p-2">Ürün</th>
                      <th className="text-left p-2">ISBN</th>
                      <th className="text-right p-2">Mevcut</th>
                      <th className="text-right p-2">Yeni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s) => (
                      <tr key={s.id} className="border-b border-gray-50">
                        <td className="p-2 line-clamp-1 max-w-xs">{s.name}</td>
                        <td className="p-2 font-mono text-xs text-gray-500">
                          {s.sku}
                        </td>
                        <td className="p-2 text-right">
                          {formatPrice(s.current)}
                        </td>
                        <td className="p-2 text-right font-semibold">
                          {formatPrice(s.next)}
                          {s.next !== s.current && (
                            <span
                              className={`ml-1 text-[10px] ${
                                s.next > s.current
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {s.next > s.current ? "↑" : "↓"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.affected > preview.sample.length && (
                  <p className="text-xs text-gray-400 mt-2 text-right">
                    İlk {preview.sample.length} satır gösteriliyor (toplam{" "}
                    {preview.affected})
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="text-lg font-semibold text-brand-black mt-0.5">{value}</p>
    </div>
  );
}
