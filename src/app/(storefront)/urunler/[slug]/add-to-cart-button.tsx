"use client";

import { useState } from "react";
import { useCartStore, CartProduct } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { toast } from "@/stores/toast-store";
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

  const inStock = product.stockQuantity > 0;
  const remaining = Math.max(0, product.stockQuantity - existingInCart);
  const canAdd = remaining > 0;

  function add() {
    if (!inStock || !canAdd) return;
    const toAdd = Math.min(quantity, remaining);
    if (toAdd < quantity) {
      toast.warning(`Stokta yalnizca ${remaining} adet kaldi.`);
    }
    addItem(product, toAdd);
    setJustAdded(true);
    toast.success("Sepete eklendi", product.name, );
    setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <div className="space-y-3">
      {inStock ? (
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
            <span className="min-w-[3ch] px-2 text-center text-sm font-semibold tabular-nums">
              {quantity}
            </span>
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
            else toast.info("Favorilerden cikarildi");
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
            if (res === "added") toast.success("Karsilastirmaya eklendi");
            else if (res === "removed") toast.info("Karsilastirmadan cikarildi");
            else toast.warning("En fazla 4 urun karsilastirabilirsiniz");
          }}
          activeClass="bg-sky-50 text-sky-600 border-sky-200"
        >
          <ScaleIcon className="h-4 w-4" />
          {inCompare ? "Karsilastirmada" : "Karsilastir"}
        </SecondaryAction>
      </div>

      {canAdd && existingInCart > 0 && (
        <p className="text-xs text-neutral-500">
          Sepetinizde {existingInCart} adet mevcut. {remaining} adet daha eklenebilir.
        </p>
      )}
      {inStock && !canAdd && (
        <p className="text-xs text-amber-700">
          Bu urunun tum stogu sepetinizde.
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
