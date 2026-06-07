"use client";

import { useState } from "react";

export type Patch = {
  price?: number;
  oldPrice?: number | null;
  vatRate?: number;
  stockQuantity?: number;
  categoryId?: string | null;
  publisherId?: string | null;
  discountGroup?: string | null;
  isPublished?: boolean;
};

type Field =
  | "price"
  | "oldPrice"
  | "vatRate"
  | "stockQuantity"
  | "categoryId"
  | "publisherId"
  | "discountGroup";

const FIELD_LABELS: Record<Field, string> = {
  price: "Fiyat (TL)",
  oldPrice: "Eski Fiyat (TL)",
  vatRate: "KDV (%)",
  stockQuantity: "Stok",
  categoryId: "Kategori",
  publisherId: "Yayınevi",
  discountGroup: "İskonto Grubu",
};

interface Category {
  id: string;
  name: string;
  type: string;
}
interface Publisher {
  id: string;
  name: string;
}

interface Props {
  count: number;
  categories: Category[];
  publishers: Publisher[];
  onClose: () => void;
  onApply: (patch: Patch) => Promise<void> | void;
  pending: boolean;
}

export function ProductsBulkUpdateModal({
  count,
  categories,
  publishers,
  onClose,
  onApply,
  pending,
}: Props) {
  const [field, setField] = useState<Field>("vatRate");
  const [numValue, setNumValue] = useState("");
  const [strValue, setStrValue] = useState("");
  const [clearStr, setClearStr] = useState(false);

  function buildPatch(): Patch | null {
    if (field === "price" || field === "vatRate" || field === "stockQuantity") {
      const n = Number(numValue);
      if (!Number.isFinite(n) || n < 0) return null;
      return { [field]: n } as Patch;
    }
    if (field === "oldPrice") {
      if (clearStr) return { oldPrice: null };
      const n = Number(numValue);
      if (!Number.isFinite(n) || n < 0) return null;
      return { oldPrice: n };
    }
    if (field === "categoryId" || field === "publisherId") {
      if (clearStr) return { [field]: null } as Patch;
      if (!strValue) return null;
      return { [field]: strValue } as Patch;
    }
    if (field === "discountGroup") {
      if (clearStr) return { discountGroup: null };
      if (!strValue.trim()) return null;
      return { discountGroup: strValue.trim() };
    }
    return null;
  }

  const isNumber = ["price", "oldPrice", "vatRate", "stockQuantity"].includes(
    field
  );
  const isOptional = [
    "oldPrice",
    "categoryId",
    "publisherId",
    "discountGroup",
  ].includes(field);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-display font-bold text-brand-black">
            Toplu Güncelle
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{count}</strong> ürüne ayni yeni deger uygulanir.
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Hangi alan?
          </span>
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value as Field);
              setNumValue("");
              setStrValue("");
              setClearStr(false);
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        {isOptional && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={clearStr}
              onChange={(e) => setClearStr(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Bu alani temizle (deger atama, mevcut degeri sil)
          </label>
        )}

        {!clearStr && isNumber && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yeni deger
            </span>
            <input
              type="number"
              min={0}
              step={field === "vatRate" || field === "price" || field === "oldPrice" ? "0.01" : "1"}
              value={numValue}
              onChange={(e) => setNumValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              autoFocus
            />
          </label>
        )}

        {!clearStr && field === "categoryId" && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yeni kategori
            </span>
            <select
              value={strValue}
              onChange={(e) => setStrValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Seciniz</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </label>
        )}

        {!clearStr && field === "publisherId" && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yeni yayınevi
            </span>
            <select
              value={strValue}
              onChange={(e) => setStrValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">Seciniz</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {!clearStr && field === "discountGroup" && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Yeni iskonto grubu
            </span>
            <input
              type="text"
              value={strValue}
              onChange={(e) => setStrValue(e.target.value)}
              placeholder="orn. KIT-2026"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              autoFocus
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={async () => {
              const patch = buildPatch();
              if (!patch) return;
              await onApply(patch);
            }}
            disabled={pending || !buildPatch()}
            className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>
  );
}
