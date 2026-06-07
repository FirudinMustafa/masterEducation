"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { PriceDisplay } from "./price-display";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { toast } from "@/stores/toast-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useCanOrder, ensureCanOrder } from "@/lib/use-can-order";
import {
  XMarkIcon,
  HeartIcon,
  HeartIconSolid,
  ScaleIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ProductSummary } from "@/types/product";

interface Props {
  product: ProductSummary;
  open: boolean;
  onClose: () => void;
}

export function QuickViewModal({ product, open, onClose }: Props) {
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const inWishlistRaw = useWishlistStore((s) => s.has(product.id));
  const toggleCompare = useCompareStore((s) => s.toggle);
  const inCompareRaw = useCompareStore((s) => s.has(product.id));
  const inWishlist = hydrated && inWishlistRaw;
  const inCompare = hydrated && inCompareRaw;
  const canOrder = useCanOrder();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const inStock = product.stockQuantity > 0;
  const cartPrice =
    product.dealerPrice != null && product.dealerPrice < product.price
      ? product.dealerPrice
      : product.price;

  function addToCart() {
    if (!ensureCanOrder(canOrder)) return;
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 ring-1 ring-neutral-200 hover:bg-white hover:text-neutral-900 cursor-pointer"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="relative aspect-square bg-neutral-50 md:aspect-auto">
          <ProductImage
            src={product.imageSrc || undefined}
            alt={product.name}
            width={600}
            height={600}
            className="h-full w-full object-contain p-6"
          />
        </div>

        <div className="flex flex-col p-6 md:p-8">
          {product.publisherName && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
              {product.publisherName}
            </p>
          )}
          <h2 className="mb-3 font-display text-xl font-bold text-neutral-900">
            {product.name}
          </h2>

          <div className="mb-4 flex items-center gap-2 text-xs">
            {inStock ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                Stokta
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                <XCircleIcon className="h-3.5 w-3.5" />
                Stokta yok
              </span>
            )}
            <span className="text-neutral-400">ISBN: {product.sku}</span>
          </div>

          <div className="mb-6">
            <PriceDisplay
              price={product.price}
              oldPrice={product.oldPrice}
              dealerPrice={product.dealerPrice}
              discountPct={product.dealerDiscountPct}
              size="lg"
            />
          </div>

          <div className="flex items-stretch gap-2">
            <button
              onClick={addToCart}
              disabled={!inStock}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold px-5 py-3 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <ShoppingCartIcon className="h-4 w-4" />
              Sepete Ekle
            </button>
            <button
              onClick={() => {
                const added = toggleWishlist(product);
                if (added) toast.success("Favorilere eklendi");
                else toast.info("Favorilerden çıkarildi");
              }}
              aria-label="Favori"
              className={cn(
                "flex w-12 items-center justify-center rounded-xl ring-1 transition-colors cursor-pointer",
                inWishlist
                  ? "bg-rose-50 text-rose-600 ring-rose-200"
                  : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"
              )}
            >
              {inWishlist ? (
                <HeartIconSolid className="h-5 w-5" />
              ) : (
                <HeartIcon className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => {
                const res = toggleCompare(product);
                if (res === "added") toast.success("Karşılaştırmaya eklendi");
                else if (res === "removed") toast.info("Karşılaştırmadan çıkarildi");
                else toast.warning("En fazla 4 ürün karşılaştırabilirsiniz");
              }}
              aria-label="Karşılaştır"
              className={cn(
                "flex w-12 items-center justify-center rounded-xl ring-1 transition-colors cursor-pointer",
                inCompare
                  ? "bg-sky-50 text-sky-600 ring-sky-200"
                  : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50"
              )}
            >
              <ScaleIcon className="h-5 w-5" />
            </button>
          </div>

          <Link
            href={`/urunler/${product.slug}`}
            onClick={onClose}
            className="mt-4 inline-flex items-center justify-center gap-1 text-sm font-semibold text-brand-gold-dark hover:underline"
          >
            Detay Sayfasini Gor
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
