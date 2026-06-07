"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Admin ürün listesi filtre çubuğu — butonsuz/anlık.
 * Arama kutusuna yazıldıkça (debounce ~300ms) ve stok min/max değiştikçe URL
 * paramları (`ara`, `stokMin`, `stokMax`) güncellenir; sunucu bileşeni yeniden
 * render olur. Filtre değişince sayfa 1'e döner (sayfa paramı düşürülür).
 */
export function ProductsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [ara, setAra] = useState(sp.get("ara") ?? "");
  const [stokMin, setStokMin] = useState(sp.get("stokMin") ?? "");
  const [stokMax, setStokMax] = useState(sp.get("stokMax") ?? "");

  // Mount'ta URL'i tekrar yazıp sayfayı sıfırlamamak için ilk çalıştırmayı atla.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (ara.trim()) params.set("ara", ara.trim());
      if (stokMin.trim()) params.set("stokMin", stokMin.trim());
      if (stokMax.trim()) params.set("stokMax", stokMax.trim());
      const qs = params.toString();
      startTransition(() =>
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ara, stokMin, stokMax]);

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[220px] max-w-md">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Ara (ad / ISBN / yazar)
        </label>
        <input
          type="text"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder="Ürün ara..."
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Stok min
        </label>
        <input
          type="number"
          min={0}
          value={stokMin}
          onChange={(e) => setStokMin(e.target.value)}
          placeholder="0"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        />
      </div>
      <div className="w-28">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Stok max
        </label>
        <input
          type="number"
          min={0}
          value={stokMax}
          onChange={(e) => setStokMax(e.target.value)}
          placeholder="∞"
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        />
      </div>
      {pending && (
        <span className="pb-2.5 text-xs text-gray-400">Filtreleniyor…</span>
      )}
    </div>
  );
}
