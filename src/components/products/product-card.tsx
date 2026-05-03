"use client";

import { useState } from "react";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { PriceDisplay } from "./price-display";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { toast } from "@/stores/toast-store";
import {
  ShoppingCartIcon,
  HeartIcon,
  HeartIconSolid,
  ScaleIcon,
  EyeIcon,
  CheckIcon,
  StarIconSolid,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ProductSummary } from "@/types/product";
import { useHydrated } from "@/lib/use-hydrated";
import { QuickViewModal } from "./quick-view-modal";

interface Props {
  product: ProductSummary;
}

export function ProductCard({ product }: Props) {
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const inWishlistRaw = useWishlistStore((s) => s.has(product.id));
  const toggleCompare = useCompareStore((s) => s.toggle);
  const inCompareRaw = useCompareStore((s) => s.has(product.id));
  const inWishlist = hydrated && inWishlistRaw;
  const inCompare = hydrated && inCompareRaw;

  const inStock = product.stockQuantity > 0;
  const lowStock = inStock && product.stockQuantity <= 5;
  const cartPrice =
    product.dealerPrice != null && product.dealerPrice < product.price
      ? product.dealerPrice
      : product.price;
  const discountPct =
    product.oldPrice && product.oldPrice > product.price
      ? Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)
      : null;
  const hasRating =
    product.avgRating != null &&
    product.reviewCount != null &&
    product.reviewCount > 0;

  function onAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!inStock) return;
    addItem({
      id: product.id,
      name: product.name,
      price: cartPrice,
      slug: product.slug,
      imageSrc: product.imageSrc || undefined,
      sku: product.sku,
      stockQuantity: product.stockQuantity,
    });
    toast.success("Sepete eklendi", product.name);
  }

  function onToggleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const added = toggleWishlist(product);
    if (added) toast.success("Favorilere eklendi", product.name);
    else toast.info("Favorilerden cikarildi", product.name);
  }

  function onToggleCompare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const res = toggleCompare(product);
    if (res === "added") toast.success("Karsilastirmaya eklendi", product.name);
    else if (res === "removed") toast.info("Karsilastirmadan cikarildi", product.name);
    else if (res === "limit") toast.warning("En fazla 4 urun karsilastirabilirsiniz");
  }

  function onQuickView(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setQuickViewOpen(true);
  }

  return (
    <>
      <Link
        href={`/urunler/${product.slug}`}
        className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-xl"
      >
        {/* Image area */}
        <div className="relative aspect-square overflow-hidden bg-neutral-50">
          <ProductImage
            src={product.imageSrc || undefined}
            alt={product.name}
            width={400}
            height={400}
            className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
          />

          {/* Top-left badges */}
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {discountPct && (
              <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                -%{discountPct}
              </span>
            )}
            {product.dealerDiscountPct && product.dealerDiscountPct > 0 && (
              <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Bayi -%{product.dealerDiscountPct}
              </span>
            )}
            {lowStock && (
              <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Son {product.stockQuantity}
              </span>
            )}
          </div>

          {/* Top-right action stack (visible on hover on desktop; always visible on mobile) */}
          <div className="absolute right-2 top-2 flex flex-col gap-1.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
            <ActionBtn
              active={inWishlist}
              onClick={onToggleWishlist}
              label="Favori"
              activeClass="bg-rose-50 text-rose-600 ring-rose-200"
            >
              {inWishlist ? (
                <HeartIconSolid className="h-4 w-4" />
              ) : (
                <HeartIcon className="h-4 w-4" />
              )}
            </ActionBtn>
            <ActionBtn
              active={inCompare}
              onClick={onToggleCompare}
              label="Karsilastir"
              activeClass="bg-sky-50 text-sky-600 ring-sky-200"
            >
              <ScaleIcon className="h-4 w-4" />
            </ActionBtn>
            <ActionBtn onClick={onQuickView} label="Hizli bakis">
              <EyeIcon className="h-4 w-4" />
            </ActionBtn>
          </div>

          {!inStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-500 shadow-sm">
                Stokta Yok
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col p-3 sm:p-3.5">
          {product.publisherName && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1 line-clamp-1 sm:text-[10px]">
              {product.publisherName}
            </p>
          )}
          <h3 className="mb-1.5 line-clamp-2 min-h-[2.25rem] text-sm font-medium leading-snug text-neutral-900">
            {product.name}
          </h3>
          {hasRating && (
            <div className="mb-auto flex items-center gap-1 text-[11px] text-neutral-500">
              <StarIconSolid className="h-3.5 w-3.5 text-amber-400" />
              <span className="font-semibold text-neutral-800">
                {product.avgRating!.toFixed(1)}
              </span>
              <span>({product.reviewCount})</span>
            </div>
          )}
          {!hasRating && <div className="mb-auto" />}
          <div className="mt-3 flex items-end justify-between gap-2">
            <PriceDisplay
              price={product.price}
              oldPrice={product.oldPrice}
              dealerPrice={product.dealerPrice}
              discountPct={product.dealerDiscountPct}
              size="sm"
            />
            {inStock && (
              <button
                onClick={onAdd}
                className="shrink-0 rounded-lg bg-brand-gold p-2.5 text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md cursor-pointer sm:p-2"
                aria-label="Sepete ekle"
              >
                <ShoppingCartIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </Link>

      <QuickViewModal
        product={product}
        open={quickViewOpen}
        onClose={() => setQuickViewOpen(false)}
      />
    </>
  );
}

function ActionBtn({
  children,
  onClick,
  label,
  active,
  activeClass,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-600 ring-1 ring-neutral-200 shadow-sm transition-all hover:bg-neutral-900 hover:text-white hover:ring-neutral-900 cursor-pointer sm:h-8 sm:w-8",
        active && activeClass
      )}
    >
      {children}
    </button>
  );
}

export function InCartBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
      <CheckIcon className="h-3 w-3" />
      Sepette
    </span>
  );
}
