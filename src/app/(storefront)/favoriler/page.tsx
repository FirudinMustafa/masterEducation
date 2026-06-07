"use client";

import Link from "next/link";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "@/stores/toast-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useCanOrder, ensureCanOrder } from "@/lib/use-can-order";
import { ProductGrid } from "@/components/products/product-grid";
import {
  HeartIcon,
  ShoppingCartIcon,
  TrashIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";

export default function WishlistPage() {
  const hydrated = useHydrated();
  const itemsRaw = useWishlistStore((s) => s.items);
  const items = hydrated ? itemsRaw : [];
  const clear = useWishlistStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const canOrder = useCanOrder();

  if (!hydrated) {
    return <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6" />;
  }

  function addAllToCart() {
    if (!ensureCanOrder(canOrder)) return;
    let added = 0;
    items.forEach((p) => {
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
        1
      );
      added += 1;
    });
    if (added > 0) toast.success(`${added} ürün sepete eklendi`);
    else toast.warning("Eklenebilecek stokta ürün yok");
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50">
          <HeartIcon className="h-10 w-10 text-rose-400" />
        </div>
        <h1 className="font-display text-2xl font-bold text-neutral-900">
          Favori listeniz bos
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Begendiginiz ürünlerin kalp ikonuna tiklayarak favorilerinize ekleyin.
        </p>
        <Link
          href="/urunler"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-gold px-6 py-3 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md"
        >
          Ürünlere Gözat
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-neutral-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-neutral-900">
            <HeartIcon className="h-7 w-7 text-rose-500" />
            Favorilerim
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {items.length} ürün listenizde
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addAllToCart}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md cursor-pointer"
          >
            <ShoppingCartIcon className="h-4 w-4" />
            Tümunu Sepete Ekle
          </button>
          <button
            onClick={() => {
              clear();
              toast.info("Favoriler temizlendi");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
          >
            <TrashIcon className="h-4 w-4" />
            Temizle
          </button>
        </div>
      </div>

      <ProductGrid products={items} />
    </div>
  );
}
