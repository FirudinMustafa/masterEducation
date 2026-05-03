"use client";

import { useEffect } from "react";
import { useRecentlyViewedStore } from "@/stores/recently-viewed-store";
import { ProductGrid } from "./product-grid";
import type { ProductSummary } from "@/types/product";
import { ClockIcon } from "@/components/ui/icons";

export function TrackRecentlyViewed({ product }: { product: ProductSummary }) {
  const push = useRecentlyViewedStore((s) => s.push);
  useEffect(() => {
    push(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  return null;
}

export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const items = useRecentlyViewedStore((s) => s.items);
  const filtered = excludeId ? items.filter((i) => i.id !== excludeId) : items;
  if (filtered.length === 0) return null;
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-center gap-2">
        <ClockIcon className="h-5 w-5 text-neutral-400" />
        <h2 className="font-display text-xl font-bold text-neutral-900">
          Son Gezdikleriniz
        </h2>
      </div>
      <ProductGrid products={filtered.slice(0, 8)} />
    </section>
  );
}
