"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductSummary } from "@/types/product";

const MAX_ITEMS = 12;

interface RecentlyViewedState {
  items: ProductSummary[];
  push: (product: ProductSummary) => void;
  clear: () => void;
}

export const useRecentlyViewedStore = create<RecentlyViewedState>()(
  persist(
    (set) => ({
      items: [],
      push: (product) => {
        set((s) => {
          const filtered = s.items.filter((i) => i.id !== product.id);
          return { items: [product, ...filtered].slice(0, MAX_ITEMS) };
        });
      },
      clear: () => set({ items: [] }),
    }),
    { name: "master-education-recently-viewed" }
  )
);
