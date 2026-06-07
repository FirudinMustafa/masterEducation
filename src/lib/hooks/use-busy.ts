"use client";
import { useState, useCallback, useRef } from "react";

/**
 * useBusy: in-flight aksiyon guard'ı.
 *
 * - `busy` true iken handler tekrar tetiklenmez (yutuyor).
 * - Concurrent çağrılar tek seferde resolve olur; ikinci-tıklama no-op.
 * - useTransition'dan farkı: state in-flight fetch sırasında DA true,
 *   sadece startTransition içinde değil. Double-submit yarışını gerçekten kapatır.
 *
 * Kullanım:
 *   const { busy, run } = useBusy();
 *   <Button disabled={busy} onClick={() => run(async () => { await fetch(...); })} />
 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      try {
        return await fn();
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    []
  );

  return { busy, run };
}
