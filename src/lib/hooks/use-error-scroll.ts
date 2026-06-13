"use client";

import { useEffect, useRef } from "react";

/**
 * Admin formlarında ortak hata-odaklama davranışı.
 *
 * `error` state'i dolduğunda:
 *  1. Hata kutusunu görünür alana kaydırır (oto-scroll).
 *  2. Form içindeki ilk geçersiz/boş alanı odaklar (varsa) — native `:invalid`
 *     (zorunlu boş alan, min/max ihlali) veya `aria-invalid="true"`/`data-error`
 *     işaretli alan.
 *
 * Kullanım:
 *   const errorRef = useErrorScroll(error);
 *   ...
 *   {error && <div ref={errorRef} className="...">{error}</div>}
 */
export function useErrorScroll<T extends HTMLElement = HTMLDivElement>(
  error: string | null
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!error || !ref.current) return;
    const el = ref.current;
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    const form = el.closest("form");
    const scope: ParentNode = form ?? document;
    const invalid = scope.querySelector<HTMLElement>(
      "[aria-invalid='true'], [data-error='true'], :invalid"
    );
    if (invalid && typeof invalid.focus === "function") {
      // Scroll animasyonu ile çakışmasın diye odağı bir sonraki frame'e bırak.
      requestAnimationFrame(() => invalid.focus({ preventScroll: false }));
    }
  }, [error]);

  return ref;
}
