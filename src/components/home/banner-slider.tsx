"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

export interface BannerSlide {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  title: string | null;
}

/**
 * Ana sayfa banner slider — admin panelden yönetilen aktif bannerlar. Otomatik
 * geçiş (5sn) + ok/nokta navigasyonu. Banner yoksa parent zarif bir fallback
 * gösterir (bu bileşen yalnız 1+ slide ile render edilir).
 */
export function BannerSlider({ slides }: { slides: BannerSlide[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  const go = useCallback(
    (n: number) => setIndex((prev) => ((n % count) + count) % count),
    [count]
  );

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((p) => (p + 1) % count), 5000);
    return () => clearInterval(t);
  }, [count]);

  if (count === 0) return null;

  return (
    <section className="relative w-full overflow-hidden bg-neutral-100">
      <div className="relative mx-auto max-w-[1400px]">
        <div className="relative aspect-[16/6] w-full min-h-[180px]">
          {slides.map((s, i) => {
            const inner = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.imageUrl}
                alt={s.title ?? ""}
                className="h-full w-full object-cover"
              />
            );
            return (
              <div
                key={s.id}
                className={`absolute inset-0 transition-opacity duration-700 ${
                  i === index ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
                aria-hidden={i !== index}
              >
                {s.linkUrl ? (
                  <Link href={s.linkUrl} className="block h-full w-full">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </div>
            );
          })}
        </div>

        {count > 1 && (
          <>
            <button
              onClick={() => go(index - 1)}
              aria-label="Önceki"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-brand-black hover:bg-white shadow cursor-pointer"
            >
              ‹
            </button>
            <button
              onClick={() => go(index + 1)}
              aria-label="Sonraki"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-brand-black hover:bg-white shadow cursor-pointer"
            >
              ›
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  aria-label={`${i + 1}. slayt`}
                  className={`h-2.5 rounded-full transition-all ${
                    i === index ? "w-6 bg-white" : "w-2.5 bg-white/60 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
