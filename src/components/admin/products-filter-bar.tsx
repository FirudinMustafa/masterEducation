"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface FilterOption {
  id: string;
  name: string;
  type?: string;
}

/**
 * Admin ürün listesi filtre çubuğu — butonsuz/anlık ve BAĞIMSIZ filtreler.
 *
 * Kategori ve Yayınevi select'leri seçilir seçilmez (debounce'suz) uygulanır ve
 * her biri DİĞERLERİNDEN BAĞIMSIZDIR: sadece kategori seçmek tek başına filtreler;
 * yayınevi seçmek şart değildir. Arama ve stok min/max alanları yazılırken
 * debounce'lu (~300ms) güncellenir. Her filtre değişiminde mevcut diğer paramlar
 * korunur ve sayfa 1'e dönülür.
 *
 * Not: kategori/yayinevi değerleri ayrı state'te TUTULMAZ; doğrudan URL'den
 * (useSearchParams) okunur ve anında yazılır — böylece eski "state senkron/debounce
 * birleşmesi" yüzünden tek filtrenin işlememesi sorunu ortadan kalkar.
 */
export function ProductsFilterBar({
  categories,
  publishers,
}: {
  categories: FilterOption[];
  publishers: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Metin/sayısal alanlar debounce'lu olduğundan state'te tutulur.
  const [ara, setAra] = useState(sp.get("ara") ?? "");
  const [stokMin, setStokMin] = useState(sp.get("stokMin") ?? "");
  const [stokMax, setStokMax] = useState(sp.get("stokMax") ?? "");

  // Kategori/yayınevi doğrudan URL'den — anında uygulanır.
  const kategori = sp.get("kategori") ?? "";
  const yayinevi = sp.get("yayinevi") ?? "";

  // Mevcut URL paramlarını koruyarak verilen güncellemeleri uygular; boş değer
  // ilgili paramı kaldırır ("Tümü"). Filtre değişince sayfa 1'e döner.
  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v && v.trim()) params.set(k, v.trim());
      else params.delete(k);
    }
    params.delete("sayfa");
    const qs = params.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  // Arama + stok aralığı: yazarken her tuşta navigate etmemek için debounce.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      navigate({ ara, stokMin, stokMax });
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
      <div className="w-44">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Kategori
        </label>
        <select
          value={kategori}
          onChange={(e) => navigate({ kategori: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        >
          <option value="">Tümü</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.type ? ` (${c.type})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="w-44">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Yayınevi
        </label>
        <select
          value={yayinevi}
          onChange={(e) => navigate({ yayinevi: e.target.value })}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        >
          <option value="">Tümü</option>
          {publishers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
