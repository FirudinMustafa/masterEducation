"use client";

import { useState } from "react";

type Mode =
  | "set"
  | "percent_increase"
  | "percent_decrease"
  | "fixed_increase"
  | "fixed_decrease";

const MODE_LABELS: Record<Mode, string> = {
  set: "Tek limit ata (hepsi aynı olur)",
  percent_increase: "% artır",
  percent_decrease: "% azalt",
  fixed_increase: "Sabit TL ekle",
  fixed_decrease: "Sabit TL çıkar",
};

interface Props {
  count: number;
  totalSelected: number;
  onClose: () => void;
  onApply: (payload: {
    mode: Mode;
    value: number;
    minLimit?: number;
  }) => Promise<void> | void;
  pending: boolean;
}

export function DealersBulkCreditModal({
  count,
  totalSelected,
  onClose,
  onApply,
  pending,
}: Props) {
  const [mode, setMode] = useState<Mode>("percent_increase");
  const [value, setValue] = useState("");
  const [minLimit, setMinLimit] = useState("");

  const isPercent = mode === "percent_increase" || mode === "percent_decrease";
  const showFloor = mode === "percent_decrease" || mode === "fixed_decrease";
  const buildable = value !== "" && Number(value) >= 0;

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
            Toplu Limit Ayarla
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{count}</strong> APPROVED + cari-hesap bayi etkilenecek
            {totalSelected !== count && (
              <> ({totalSelected - count} bayi atlanacak — pesin veya onaylanmamış)</>
            )}
            .
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">İşlem</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
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
            onChange={(e) => setValue(e.target.value)}
            placeholder={isPercent ? "10" : "5000"}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            autoFocus
          />
        </label>

        {showFloor && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Minimum limit (opsiyonel — düşüş bu değerin altına inmez)
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={minLimit}
              onChange={(e) => setMinLimit(e.target.value)}
              placeholder="orn. 1000"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
              await onApply({
                mode,
                value: Number(value),
                minLimit: minLimit ? Number(minLimit) : undefined,
              });
            }}
            disabled={pending || !buildable || count === 0}
            className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>
  );
}
