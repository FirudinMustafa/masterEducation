"use client";

import Link from "next/link";
import { useCompareStore, MAX_COMPARE_ITEMS } from "@/stores/compare-store";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { toast } from "@/stores/toast-store";
import { useHydrated } from "@/lib/use-hydrated";
import { ProductImage } from "@/components/products/product-image";
import { cn } from "@/lib/utils";
import {
  ScaleIcon,
  XMarkIcon,
  ShoppingCartIcon,
  HeartIcon,
  HeartIconSolid,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";

type CompareItem = ReturnType<typeof useCompareStore.getState>["items"][number];

const ROWS: {
  label: string;
  render: (p: CompareItem) => React.ReactNode;
}[] = [
  { label: "Yayınevi", render: (p) => p.publisherName ?? "—" },
  {
    label: "ISBN",
    render: (p) => <code className="text-xs">{p.sku}</code>,
  },
  {
    label: "Stok Durumu",
    render: (p) =>
      p.stockQuantity > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircleIcon className="h-3 w-3" /> Stokta
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          <XCircleIcon className="h-3 w-3" /> Yok
        </span>
      ),
  },
  {
    label: "Adet",
    render: (p) => (
      <span className="text-sm text-neutral-700">
        {p.stockQuantity.toLocaleString("tr-TR")} adet
      </span>
    ),
  },
];

export default function ComparePage() {
  const hydrated = useHydrated();
  const itemsRaw = useCompareStore((s) => s.items);
  const items = hydrated ? itemsRaw : [];
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const inWishlist = useWishlistStore((s) => s.has);

  if (!hydrated) {
    return <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6" />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-sky-50">
          <ScaleIcon className="h-10 w-10 text-sky-400" />
        </div>
        <h1 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
          Karşılaştırma listeniz bos
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Ürün kartlarinda terazi ikonuna tiklayarak en fazla {MAX_COMPARE_ITEMS}{" "}
          ürünu karşılaştırabilirsiniz.
        </p>
        <Link
          href="/urunler"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-gold px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md sm:px-6"
        >
          Ürünlere Gözat
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  function onAddToCart(p: CompareItem) {
    if (p.stockQuantity <= 0) return;
    const price =
      p.dealerPrice != null && p.dealerPrice < p.price ? p.dealerPrice : p.price;
    addItem(
      {
        id: p.id,
        name: p.name,
        price,
        slug: p.slug,
        sku: p.sku,
        stockQuantity: p.stockQuantity,
        imageSrc: p.imageSrc || undefined,
      },
      1,
    );
    toast.success("Sepete eklendi", p.name);
  }

  function onToggleWishlist(p: CompareItem) {
    const added = toggleWishlist(p);
    if (added) toast.success("Favorilere eklendi");
    else toast.info("Favorilerden çıkarildi");
  }

  function onRemove(p: CompareItem) {
    remove(p.id);
    toast.info("Karşılaştırmadan çıkarildi");
  }

  const effectiveRows = ROWS;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-5 flex flex-col gap-3 border-b border-neutral-100 pb-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-neutral-900 sm:text-3xl">
            <ScaleIcon className="h-6 w-6 text-sky-500 sm:h-7 sm:w-7" />
            Karşılaştırma
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {items.length}/{MAX_COMPARE_ITEMS} ürün karşılaştıriliyor
          </p>
        </div>
        <button
          onClick={() => {
            clear();
            toast.info("Karşılaştırma temizlendi");
          }}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer sm:self-auto"
        >
          <XMarkIcon className="h-4 w-4" />
          Temizle
        </button>
      </div>

      {/* Mobile: dikey kart listesi */}
      <div className="space-y-4 md:hidden">
        {items.map((p) => (
          <div
            key={p.id}
            className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white"
          >
            <button
              onClick={() => onRemove(p)}
              aria-label="Çıkar"
              className="absolute right-2 top-2 z-10 rounded-full bg-white p-1.5 text-neutral-400 ring-1 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-700 cursor-pointer"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
            <div className="flex gap-3 p-4">
              <Link
                href={`/urunler/${p.slug}`}
                className="shrink-0"
              >
                <div className="h-24 w-24 overflow-hidden rounded-lg bg-neutral-50">
                  <ProductImage
                    src={p.imageSrc || undefined}
                    alt={p.name}
                    width={96}
                    height={96}
                    className="h-full w-full object-contain p-1"
                  />
                </div>
              </Link>
              <div className="min-w-0 flex-1 pr-8">
                <Link href={`/urunler/${p.slug}`}>
                  <h3 className="line-clamp-2 text-sm font-medium text-neutral-900">
                    {p.name}
                  </h3>
                </Link>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => onAddToCart(p)}
                    disabled={p.stockQuantity <= 0}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-gold px-2 py-1.5 text-xs font-bold text-neutral-800 shadow-sm hover:bg-brand-gold-dark disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    <ShoppingCartIcon className="h-3.5 w-3.5" />
                    Sepet
                  </button>
                  <button
                    onClick={() => onToggleWishlist(p)}
                    aria-label="Favori"
                    className={cn(
                      "rounded-lg border px-2 py-1.5 cursor-pointer",
                      inWishlist(p.id)
                        ? "border-rose-200 bg-rose-50 text-rose-600"
                        : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
                    )}
                  >
                    {inWishlist(p.id) ? (
                      <HeartIconSolid className="h-3.5 w-3.5" />
                    ) : (
                      <HeartIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <dl className="divide-y divide-neutral-100 border-t border-neutral-100 text-sm">
              {effectiveRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <dt className="shrink-0 text-xs font-semibold text-neutral-500">
                    {row.label}
                  </dt>
                  <dd className="min-w-0 text-right">{row.render(p)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {/* Desktop: yatay karşılaştırma grid'i */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[640px] gap-4"
            style={{
              gridTemplateColumns: `140px repeat(${items.length}, minmax(200px, 1fr))`,
            }}
          >
            {/* Header row: product cards */}
            <div />
            {items.map((p) => (
              <div
                key={p.id}
                className="relative rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <button
                  onClick={() => onRemove(p)}
                  aria-label="Çıkar"
                  className="absolute right-2 top-2 rounded-full bg-white p-1 text-neutral-400 ring-1 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-700 cursor-pointer"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
                <Link href={`/urunler/${p.slug}`}>
                  <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-neutral-50">
                    <ProductImage
                      src={p.imageSrc || undefined}
                      alt={p.name}
                      width={240}
                      height={240}
                      className="h-full w-full object-contain p-2"
                    />
                  </div>
                  <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-neutral-900">
                    {p.name}
                  </h3>
                </Link>
                <div className="mt-3 flex gap-1.5">
                  <button
                    onClick={() => onAddToCart(p)}
                    disabled={p.stockQuantity <= 0}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-gold px-2 py-1.5 text-xs font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    <ShoppingCartIcon className="h-3.5 w-3.5" />
                    Sepet
                  </button>
                  <button
                    onClick={() => onToggleWishlist(p)}
                    aria-label="Favori"
                    className={cn(
                      "rounded-lg border px-2 py-1.5 cursor-pointer",
                      inWishlist(p.id)
                        ? "border-rose-200 bg-rose-50 text-rose-600"
                        : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50",
                    )}
                  >
                    {inWishlist(p.id) ? (
                      <HeartIconSolid className="h-3.5 w-3.5" />
                    ) : (
                      <HeartIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {/* Attribute rows */}
            {effectiveRows.map((row) => (
              <RowBlock key={row.label} label={row.label}>
                {items.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-neutral-100 bg-white p-4"
                  >
                    {row.render(p)}
                  </div>
                ))}
              </RowBlock>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center text-sm font-semibold text-neutral-500">
        {label}
      </div>
      {children}
    </>
  );
}
