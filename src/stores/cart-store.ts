"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  slug: string;
  imageSrc?: string;
  sku: string;
  stockQuantity: number;
}

export interface CartItemData {
  productId: string;
  product: CartProduct;
  quantity: number;
}

export interface CartDiff {
  productId: string;
  kind: "removed" | "priceChanged" | "stockReduced" | "outOfStock";
  oldValue?: number;
  newValue?: number;
}

interface CartState {
  items: CartItemData[];
  note: string;
  lastRefreshAt: number | null;
  addItem: (product: CartProduct, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setNote: (note: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  refreshFromServer: () => Promise<CartDiff[]>;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      note: "",
      lastRefreshAt: null,

      addItem: (product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find((i) => i.productId === product.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === product.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return {
            items: [...state.items, { productId: product.id, product, quantity }],
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        }));
      },

      setNote: (note) => set({ note }),

      clearCart: () => set({ items: [], note: "", lastRefreshAt: null }),

      getSubtotal: () => {
        return get().items.reduce(
          (sum, item) => sum + item.product.price * item.quantity,
          0
        );
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      refreshFromServer: async () => {
        const items = get().items;
        if (items.length === 0) {
          set({ lastRefreshAt: Date.now() });
          return [];
        }

        let res: Response;
        try {
          res = await fetch("/api/cart/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: items.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
              })),
            }),
          });
        } catch {
          return [];
        }
        if (!res.ok) return [];

        const data = (await res.json()) as {
          items: Array<{
            productId: string;
            name: string;
            slug: string;
            sku: string;
            price: number;
            stockQuantity: number;
            imageSrc: string | null;
            isPublished: boolean;
          }>;
        };

        const diffs: CartDiff[] = [];
        const serverById = new Map(data.items.map((p) => [p.productId, p]));
        const nextItems: CartItemData[] = [];

        for (const item of items) {
          const fresh = serverById.get(item.productId);
          if (!fresh || !fresh.isPublished) {
            diffs.push({ productId: item.productId, kind: "removed" });
            continue;
          }
          if (fresh.stockQuantity <= 0) {
            diffs.push({ productId: item.productId, kind: "outOfStock" });
            continue;
          }

          const quantity = Math.min(item.quantity, fresh.stockQuantity);
          if (quantity < item.quantity) {
            diffs.push({
              productId: item.productId,
              kind: "stockReduced",
              oldValue: item.quantity,
              newValue: quantity,
            });
          }

          if (Math.abs(fresh.price - item.product.price) > 0.001) {
            diffs.push({
              productId: item.productId,
              kind: "priceChanged",
              oldValue: item.product.price,
              newValue: fresh.price,
            });
          }

          nextItems.push({
            productId: item.productId,
            quantity,
            product: {
              id: fresh.productId,
              name: fresh.name,
              slug: fresh.slug,
              sku: fresh.sku,
              price: fresh.price,
              stockQuantity: fresh.stockQuantity,
              imageSrc: fresh.imageSrc ?? undefined,
            },
          });
        }

        set({ items: nextItems, lastRefreshAt: Date.now() });
        return diffs;
      },
    }),
    {
      name: "master-education-cart",
      partialize: (state) => ({ items: state.items, note: state.note }),
    }
  )
);
