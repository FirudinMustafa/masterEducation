"use client";

import { useState } from "react";
import Link from "next/link";
import { useCartStore, CartProduct } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { toast } from "@/stores/toast-store";
import { useCanOrder, ensureCanOrder } from "@/lib/use-can-order";
import {
  PlusIcon,
  MinusIcon,
  ShoppingCartIcon,
  CheckIcon,
  HeartIcon,
  HeartIconSolid,
  ScaleIcon,
} from "@/components/ui/icons";
import type { ProductSummary } from "@/types/product";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/lib/use-hydrated";

interface Props {
  product: CartProduct;
  summary: ProductSummary;
}

export function AddToCartButton({ product, summary }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const existingInCartRaw = useCartStore(
    (s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0
  );
  const existingInCart = hydrated ? existingInCartRaw : 0;
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const inWishlistRaw = useWishlistStore((s) => s.has(product.id));
  const toggleCompare = useCompareStore((s) => s.toggle);
  const inCompareRaw = useCompareStore((s) => s.has(product.id));
  const inWishlist = hydrated && inWishlistRaw;
  const inCompare = hydrated && inCompareRaw;

  const canOrder = useCanOrder();
  const inStock = product.stockQuantity > 0;
  const remaining = Math.max(0, product.stockQuantity - existingInCart);
  const canAdd = remaining > 0;

  function add() {
    if (!ensureCanOrder(canOrder)) return;
    if (!inStock || !canAdd) return;
    const qty = Math.max(1, quantity);
    const toAdd = Math.min(qty, remaining);
    if (toAdd < qty) {
      toast.warning(`Stokta yalnizca ${remaining} adet kaldi.`);
    }
    addItem(product, toAdd);
    setJustAdded(true);
    toast.success("Sepete eklendi", product.name, );
    setTimeout(() => setJustAdded(false), 1600);
  }

  // Manuel adet girişi: yalnız rakam kabul et, geçici olarak boş (0) kalabilir.
  function handleQtyInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setQuantity(digits === "" ? 0 : parseInt(digits, 10));
  }
  // Alan terk edilince geçerli aralığa sabitle (en az 1, en fazla kalan stok).
  function clampQtyOnBlur() {
    setQuantity((q) => {
      const n = Math.max(1, q);
      return remaining > 0 ? Math.min(remaining, n) : n;
    });
  }

  return (
    <div className="space-y-3">
      {!canOrder ? (
        <Link
          href="/giris"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-neutral-700"
        >
          <ShoppingCartIcon className="h-5 w-5" />
          Sipariş için Bayi Girişi
        </Link>
      ) : inStock ? (
        <div className="flex gap-3">
          <div className="flex items-center overflow-hidden rounded-xl border border-neutral-300 bg-white">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-3 text-neutral-500 hover:bg-neutral-50 cursor-pointer disabled:opacity-40"
              disabled={quantity <= 1}
              aria-label="Adet azalt"
            >
              <MinusIcon className="h-4 w-4" />
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={quantity === 0 ? "" : String(quantity)}
              onChange={(e) => handleQtyInput(e.target.value)}
              onBlur={clampQtyOnBlur}
              onFocus={(e) => e.target.select()}
              aria-label="Adet"
              className="w-14 border-0 px-1 py-2 text-center text-sm font-semibold tabular-nums outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setQuantity((q) => (remaining > 0 ? Math.min(remaining, q + 1) : q))}
              className="p-3 text-neutral-500 hover:bg-neutral-50 cursor-pointer disabled:opacity-40"
              disabled={quantity >= remaining}
              aria-label="Adet arttir"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={add}
            disabled={!canAdd}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition-all cursor-pointer",
              justAdded
                ? "bg-emerald-600 text-white"
                : "bg-brand-gold text-neutral-800 hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/30",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {justAdded ? (
              <>
                <CheckIcon className="h-5 w-5" />
                Eklendi
              </>
            ) : (
              <>
                <ShoppingCartIcon className="h-5 w-5" />
                Sepete Ekle
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          disabled
          className="w-full cursor-not-allowed rounded-xl bg-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-500"
        >
          Stokta Yok
        </button>
      )}

      <div className="flex items-center gap-2">
        <SecondaryAction
          active={inWishlist}
          onClick={() => {
            const added = toggleWishlist(summary);
            if (added) toast.success("Favorilere eklendi");
            else toast.info("Favorilerden çıkarildi");
          }}
          activeClass="bg-rose-50 text-rose-600 border-rose-200"
        >
          {inWishlist ? (
            <HeartIconSolid className="h-4 w-4" />
          ) : (
            <HeartIcon className="h-4 w-4" />
          )}
          {inWishlist ? "Favorilerde" : "Favorilere Ekle"}
        </SecondaryAction>
        <SecondaryAction
          active={inCompare}
          onClick={() => {
            const res = toggleCompare(summary);
            if (res === "added") toast.success("Karşılaştırmaya eklendi");
            else if (res === "removed") toast.info("Karşılaştırmadan çıkarildi");
            else toast.warning("En fazla 4 ürün karşılaştırabilirsiniz");
          }}
          activeClass="bg-sky-50 text-sky-600 border-sky-200"
        >
          <ScaleIcon className="h-4 w-4" />
          {inCompare ? "Karşılaştırmada" : "Karşılaştır"}
        </SecondaryAction>
      </div>

      {canAdd && existingInCart > 0 && (
        <p className="text-xs text-neutral-500">
          Sepetinizde {existingInCart} adet mevcut. {remaining} adet daha eklenebilir.
        </p>
      )}
      {inStock && !canAdd && (
        <p className="text-xs text-amber-700">
          Bu ürünun tüm stogu sepetinizde.
        </p>
      )}
    </div>
  );
}

function SecondaryAction({
  children,
  onClick,
  active,
  activeClass,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
        active
          ? activeClass
          : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}
