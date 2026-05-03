"use client";

import { signOut } from "next-auth/react";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { useRecentlyViewedStore } from "@/stores/recently-viewed-store";

/**
 * Centralised logout flow. Clears all client-side persisted stores
 * (cart, wishlist, compare, recently-viewed) BEFORE signing the user out,
 * so the next person to use the same browser doesn't see the previous
 * user's state.
 *
 * Session-scoped stores (sessionStorage) such as the pending-review draft
 * are left alone — they expire naturally when the browser tab closes.
 */
export async function signOutWithCleanup(callbackUrl: string = "/"): Promise<void> {
  try {
    useCartStore.getState().clearCart();
    useWishlistStore.getState().clear();
    useCompareStore.getState().clear();
    useRecentlyViewedStore.getState().clear();
  } catch {
    // Store temizleme basarisiz olsa bile logout akisi durmasin —
    // NextAuth cookie'yi zaten siler.
  }
  await signOut({ callbackUrl });
}
