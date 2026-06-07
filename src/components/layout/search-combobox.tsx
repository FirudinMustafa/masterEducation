"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { MagnifyingGlassIcon, XMarkIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface ProductHit {
  id: string;
  slug: string;
  name: string;
  price: number;
  publisherName: string | null;
  imageSrc: string | null;
}

interface SearchResults {
  products: ProductHit[];
  publishers: { slug: string; name: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
}

export function SearchCombobox({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as SearchResults;
          setResults(data);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timeout);
      ctrl.abort();
    };
  }, [query]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/urunler?ara=${encodeURIComponent(q)}`);
  }

  const hasResults =
    results &&
    (results.products.length > 0 ||
      results.publishers.length > 0 ||
      results.categories.length > 0);

  return (
    <div ref={wrapRef} className="relative w-full">
      <form onSubmit={submit}>
        <div className="group flex w-full items-center rounded-full border border-neutral-200 bg-white transition-all focus-within:border-brand-gold focus-within:ring-2 focus-within:ring-brand-gold/20">
          <MagnifyingGlassIcon className="ml-4 h-4 w-4 shrink-0 text-neutral-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Ürün, yayınevi veya kategori ara..."
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setResults(null);
                inputRef.current?.focus();
              }}
              className="mr-1 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer"
              aria-label="Temizle"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
          <button
            type="submit"
            className="mr-1 rounded-full bg-brand-gold px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-brand-gold-dark transition-colors cursor-pointer"
          >
            Ara
          </button>
        </div>
      </form>

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5">
          {loading && (
            <div className="px-4 py-3 text-xs text-neutral-500">Araniyor...</div>
          )}
          {!loading && results && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-neutral-500">
              &quot;{query}&quot; icin sonuc bulunamadi.
            </div>
          )}
          {!loading && hasResults && (
            <div className="max-h-[70vh] overflow-y-auto">
              {results!.categories.length > 0 && (
                <div className="border-b border-neutral-100 p-2">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Kategoriler
                  </p>
                  {results!.categories.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/kategoriler/${c.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-neutral-400">
                        {c.count.toLocaleString("tr-TR")} ürün
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {results!.publishers.length > 0 && (
                <div className="border-b border-neutral-100 p-2">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Yayınevleri
                  </p>
                  {results!.publishers.map((p) => (
                    <Link
                      key={p.slug}
                      href={`/yayinevleri/${p.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-neutral-400">
                        {p.count.toLocaleString("tr-TR")} ürün
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {results!.products.length > 0 && (
                <div className="p-2">
                  <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Ürünler
                  </p>
                  {results!.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/urunler/${p.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-neutral-100">
                        {p.imageSrc ? (
                          <Image
                            src={p.imageSrc}
                            alt={p.name}
                            width={40}
                            height={40}
                            className="h-full w-full object-contain p-0.5"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-neutral-500">
                          {p.publisherName ?? "—"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/urunler?ara=${encodeURIComponent(query.trim())}`);
                }}
                className={cn(
                  "block w-full border-t border-neutral-100 bg-neutral-50 px-4 py-2.5",
                  "text-center text-xs font-semibold text-brand-gold-dark hover:bg-neutral-100 transition-colors cursor-pointer"
                )}
              >
                Tüm sonuclari gor &rarr;
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
