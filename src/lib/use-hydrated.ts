"use client";

import { useEffect, useState } from "react";

/**
 * Returns true once the component has mounted in the browser. Use this to
 * gate reads from localStorage-backed stores so SSR output (always the
 * "empty" default) matches the first client render, preventing hydration
 * mismatches.
 *
 *   const hydrated = useHydrated();
 *   const realValue = useWishlistStore((s) => s.has(id));
 *   const inWishlist = hydrated ? realValue : false;
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Post-mount sinyali — SSR/client mismatch koruması; setState burada
    // bilinen ve önerilen pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  return hydrated;
}
