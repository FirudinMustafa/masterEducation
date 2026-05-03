"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductSummary } from "@/types/product";

interface WishlistState {
  items: ProductSummary[];
  add: (product: ProductSummary) => void;
  remove: (productId: string) => void;
  toggle: (product: ProductSummary) => boolean;
  has: (productId: string) => boolean;
  clear: () => void;
  count: () => number;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product) => {
        const exists = get().items.some((i) => i.id === product.id);
        if (exists) return;
        set((s) => ({ items: [...s.items, product] }));
      },
      remove: (productId) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== productId) }));
      },
      toggle: (product) => {
        const exists = get().items.some((i) => i.id === product.id);
        if (exists) {
          set((s) => ({ items: s.items.filter((i) => i.id !== product.id) }));
          return false;
        }
        set((s) => ({ items: [...s.items, product] }));
        return true;
      },
      has: (productId) => get().items.some((i) => i.id === productId),
      clear: () => set({ items: [] }),
      count: () => get().items.length,
    }),
    { name: "master-education-wishlist" }
  )
);
