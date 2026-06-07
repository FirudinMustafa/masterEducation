"use client";

import { useEffect, useState } from "react";
import { useCartStore, type CartDiff } from "@/stores/cart-store";

export function CartRefreshBanner() {
  const refresh = useCartStore((s) => s.refreshFromServer);
  const items = useCartStore((s) => s.items);
  const [diffs, setDiffs] = useState<CartDiff[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    refresh().then((result) => {
      if (!cancelled) {
        setDiffs(result);
        setDismissed(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally only run on mount; user actions trigger their own updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed || diffs.length === 0 || items.length === 0) return null;

  const messages = diffs.map((d) => {
    switch (d.kind) {
      case "removed":
        return "Bir ürün artik satilmadigi icin sepetten çıkarildi.";
      case "outOfStock":
        return "Bir ürün stokta kalmadigi icin sepetten çıkarildi.";
      case "stockReduced":
        return `Stok yetersiz — bir ürünun miktari ${d.oldValue} yerine ${d.newValue} olarak güncellendi.`;
      case "priceChanged":
        return "Bir ürünun bilgileri güncellendi.";
    }
  });

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 mb-1">
            Sepetiniz güncellendi
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
            {messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-700 hover:text-amber-900 text-xs cursor-pointer"
          aria-label="Kapat"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
