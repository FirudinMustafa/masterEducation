"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Aceternity-style floating navbar shell.
 * - At top: full-height transparent header
 * - On scroll-down: shrinks + adds glass blur
 * - On scroll-up after threshold: re-reveals (Aceternity floating navbar pattern)
 *
 * Çocuklar olduğu gibi render edilir — sadece root yüksekliği/blur'u değişir.
 */
export function NavShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setScrolled(y > 12);
      // Scroll-down past 240px → hide. Scroll-up → show.
      if (y > 240 && y > lastY.current + 4) {
        setHidden(true);
      } else if (y < lastY.current - 4) {
        setHidden(false);
      }
      lastY.current = y;
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      data-scrolled={scrolled}
      data-hidden={hidden}
      className="sticky top-0 z-40 transition-all duration-300 will-change-transform data-[hidden=true]:-translate-y-full data-[scrolled=true]:shadow-[0_1px_0_rgba(0,0,0,0.05)] data-[scrolled=true]:backdrop-blur-xl"
    >
      <div
        className="transition-colors duration-300 data-[scrolled=true]:bg-white/85"
        data-scrolled={scrolled}
      >
        {children}
      </div>
    </div>
  );
}
