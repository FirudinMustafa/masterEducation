"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import {
  ChevronDownIcon,
  XMarkIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface FilterProps {
  publishers: { id: string; name: string; slug: string }[];
  categories: { id: string; name: string; slug: string }[];
  languages: string[];
  productTypes: string[];
  currentFilters: {
    search: string;
    publisherSlug: string;
    categorySlug: string;
    language: string;
    productType: string;
    sort: string;
    minPrice: string;
    maxPrice: string;
    inStockOnly: boolean;
    discountOnly: boolean;
  };
}

export function ProductFilters({
  publishers,
  categories,
  languages,
  productTypes,
  currentFilters,
}: FilterProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(currentFilters.search);
  const [minPrice, setMinPrice] = useState(currentFilters.minPrice);
  const [maxPrice, setMaxPrice] = useState(currentFilters.maxPrice);
  const [mobileOpen, setMobileOpen] = useState(false);

  const pushFilters = useCallback(
    (overrides: Partial<FilterProps["currentFilters"]>) => {
      const merged = { ...currentFilters, ...overrides };
      const params = new URLSearchParams();
      if (merged.search) params.set("ara", merged.search);
      if (merged.publisherSlug) params.set("yayınevi", merged.publisherSlug);
      if (merged.categorySlug) params.set("kategori", merged.categorySlug);
      if (merged.language) params.set("dil", merged.language);
      if (merged.productType) params.set("tur", merged.productType);
      if (merged.sort && merged.sort !== "yeni") params.set("siralama", merged.sort);
      if (merged.minPrice) params.set("min", merged.minPrice);
      if (merged.maxPrice) params.set("max", merged.maxPrice);
      if (merged.inStockOnly) params.set("stok", "1");
      if (merged.discountOnly) params.set("indirim", "1");
      router.push(`/urunler?${params.toString()}`);
    },
    [currentFilters, router]
  );

  function applyPrice() {
    pushFilters({ minPrice, maxPrice });
  }

  function reset() {
    setSearchValue("");
    setMinPrice("");
    setMaxPrice("");
    router.push("/urunler");
  }

  const hasActive =
    currentFilters.search ||
    currentFilters.publisherSlug ||
    currentFilters.categorySlug ||
    currentFilters.language ||
    currentFilters.productType ||
    currentFilters.minPrice ||
    currentFilters.maxPrice ||
    currentFilters.inStockOnly ||
    currentFilters.discountOnly;

  const body = (
    <div className="space-y-1">
      <FilterGroup title="Arama" defaultOpen>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushFilters({ search: searchValue });
          }}
          className="flex overflow-hidden rounded-lg border border-neutral-200 focus-within:border-neutral-400"
        >
          <MagnifyingGlassIcon className="ml-3 mr-2 h-4 w-4 self-center text-neutral-400" />
          <input
            placeholder="Ürün adi, ISBN..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="flex-1 bg-transparent py-2 pr-2 text-sm focus:outline-none"
          />
        </form>
      </FilterGroup>

      <FilterGroup title="Stok ve Fiyat" defaultOpen>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
          <input
            type="checkbox"
            checked={currentFilters.inStockOnly}
            onChange={(e) => pushFilters({ inStockOnly: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900/20"
          />
          <span className="text-sm text-neutral-700">Sadece stokta olanlar</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
          <input
            type="checkbox"
            checked={currentFilters.discountOnly}
            onChange={(e) => pushFilters({ discountOnly: e.target.checked })}
            className="h-4 w-4 rounded border-neutral-300 text-rose-600 focus:ring-rose-500/20"
          />
          <span className="text-sm text-neutral-700">Sadece indirimli olanlar</span>
        </label>
      </FilterGroup>

      <FilterGroup title="Fiyat Araligi" defaultOpen>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            onBlur={applyPrice}
            className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
          <span className="text-neutral-400">—</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            onBlur={applyPrice}
            className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {[100, 250, 500, 1000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxPrice(String(v));
                pushFilters({ maxPrice: String(v) });
              }}
              className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 cursor-pointer"
            >
              ≤ {v} TL
            </button>
          ))}
        </div>
      </FilterGroup>

      {categories.length > 0 && (
        <FilterGroup title="Kategori" defaultOpen>
          <FilterList
            items={categories.map((c) => ({ value: c.slug, label: c.name }))}
            active={currentFilters.categorySlug}
            onSelect={(v) => pushFilters({ categorySlug: v })}
          />
        </FilterGroup>
      )}

      {publishers.length > 0 && (
        <FilterGroup title="Yayınevi">
          <FilterList
            items={publishers.map((p) => ({ value: p.slug, label: p.name }))}
            active={currentFilters.publisherSlug}
            onSelect={(v) => pushFilters({ publisherSlug: v })}
            searchable
          />
        </FilterGroup>
      )}

      {languages.length > 0 && (
        <FilterGroup title="Dil">
          <FilterList
            items={languages.map((l) => ({ value: l, label: l }))}
            active={currentFilters.language}
            onSelect={(v) => pushFilters({ language: v })}
          />
        </FilterGroup>
      )}

      {productTypes.length > 0 && (
        <FilterGroup title="Ürün Turu">
          <FilterList
            items={productTypes.map((t) => ({ value: t, label: t }))}
            active={currentFilters.productType}
            onSelect={(v) => pushFilters({ productType: v })}
          />
        </FilterGroup>
      )}

      {hasActive && (
        <button
          onClick={reset}
          className="mt-3 w-full rounded-lg border border-neutral-200 bg-white py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
        >
          Tüm Filtreleri Temizle
        </button>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 lg:hidden cursor-pointer"
      >
        <FunnelIcon className="h-4 w-4" />
        Filtrele
        {hasActive && <span className="ml-1 h-2 w-2 rounded-full bg-brand-gold-dark" />}
      </button>

      {mobileOpen && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4 lg:hidden">
          {body}
        </div>
      )}

      <div className="hidden lg:block">{body}</div>
    </>
  );
}

function FilterGroup({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-neutral-100 py-3 last:border-b-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1 text-left cursor-pointer"
      >
        <span className="text-sm font-semibold text-neutral-900">{title}</span>
        <ChevronDownIcon className={cn("h-4 w-4 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  );
}

function FilterList({
  items,
  active,
  onSelect,
  searchable,
}: {
  items: { value: string; label: string }[];
  active: string;
  onSelect: (v: string) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = query
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : items;
  return (
    <div>
      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ara..."
          className="mb-2 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-xs focus:border-neutral-400 focus:outline-none"
        />
      )}
      <div className="max-h-56 overflow-y-auto pr-1">
        {filtered.map((item) => {
          const isActive = active === item.value;
          return (
            <button
              key={item.value}
              onClick={() => onSelect(isActive ? "" : item.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                isActive
                  ? "bg-brand-gold-light/60 font-semibold text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              )}
            >
              <span className="truncate">{item.label}</span>
              {isActive && <XMarkIcon className="h-3.5 w-3.5 text-neutral-500" />}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-2 text-xs text-neutral-400">Bulunamadi</p>
        )}
      </div>
    </div>
  );
}
