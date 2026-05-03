"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductSummary } from "@/types/product";

export const MAX_COMPARE_ITEMS = 4;

interface CompareState {
  items: ProductSummary[];
  add: (product: ProductSummary) => { ok: boolean; reason?: "limit" | "exists" };
  remove: (productId: string) => void;
  toggle: (product: ProductSummary) => "added" | "removed" | "limit";
  has: (productId: string) => boolean;
  clear: () => void;
  count: () => number;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product) => {
        const { items } = get();
        if (items.some((i) => i.id === product.id)) {
          return { ok: false, reason: "exists" };
        }
        if (items.length >= MAX_COMPARE_ITEMS) {
          return { ok: false, reason: "limit" };
        }
        set({ items: [...items, product] });
        return { ok: true };
      },
      remove: (productId) => {
        set((s) => ({ items: s.items.filter((i) => i.id !== productId) }));
      },
      toggle: (product) => {
        const { items } = get();
        const exists = items.some((i) => i.id === product.id);
        if (exists) {
          set({ items: items.filter((i) => i.id !== product.id) });
          return "removed";
        }
        if (items.length >= MAX_COMPARE_ITEMS) return "limit";
        set({ items: [...items, product] });
        return "added";
      },
      has: (productId) => get().items.some((i) => i.id === productId),
      clear: () => set({ items: [] }),
      count: () => get().items.length,
    }),
    { name: "master-education-compare" }
  )
);
