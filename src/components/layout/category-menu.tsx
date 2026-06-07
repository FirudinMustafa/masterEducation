"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bars3Icon,
  ChevronDownIcon,
  AcademicCapIcon,
  BookOpenIcon,
  GlobeAltIcon,
  LanguageIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  elt: GlobeAltIcon,
  daf: LanguageIcon,
  ele: LanguageIcon,
  meb: AcademicCapIcon,
  "yks-dil": AcademicCapIcon,
  "francais-langue-etrangere": LanguageIcon,
  "fle": LanguageIcon,
};

interface Props {
  categories: { slug: string; name: string; count: number }[];
  publishers: { slug: string; name: string; count: number }[];
}

export function CategoryMenu({ categories, publishers }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer",
          open && "bg-neutral-100"
        )}
      >
        <Bars3Icon className="h-4 w-4" />
        Tüm Kategoriler
        <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 grid w-[min(880px,90vw)] grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 md:grid-cols-5">
          <div className="col-span-1 border-b border-neutral-100 bg-neutral-50/50 p-5 md:col-span-2 md:border-b-0 md:border-r">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Kategoriler
            </p>
            <div className="space-y-0.5">
              {categories.map((c) => {
                const Icon = CATEGORY_ICONS[c.slug] ?? BookOpenIcon;
                return (
                  <Link
                    key={c.slug}
                    href={`/kategoriler/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="group flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-5 w-5 text-neutral-400 group-hover:text-brand-gold-dark transition-colors" />
                      <span className="text-sm font-medium text-neutral-800">
                        {c.name}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-neutral-400">
                      {c.count.toLocaleString("tr-TR")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="col-span-1 p-5 md:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                Yayınevleri
              </p>
              <Link
                href="/urunler"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-brand-gold-dark hover:underline"
              >
                Tüm ürünler &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
              {publishers.map((p) => (
                <Link
                  key={p.slug}
                  href={`/yayinevleri/${p.slug}`}
                  onClick={() => setOpen(false)}
                  className="group flex items-center justify-between rounded-lg border border-neutral-100 bg-white px-3 py-2 text-sm text-neutral-700 hover:border-brand-gold/40 hover:bg-brand-gold-light/20 transition-all"
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] tabular-nums text-neutral-400">
                    {p.count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
