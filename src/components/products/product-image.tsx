"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductImageProps {
  src?: string;
  /**
   * 404 fallback chain: ana `src` yüklenemezse sırayla `fallbackSrcs[0]`,
   * `fallbackSrcs[1]`, ... denenir. Hepsi başarısız olursa BookPlaceholder
   * gösterilir. Aynı ürünün diğer image dosyalarını ileterek tek bir image'in
   * (örn. CSV-disk uyumsuzluğu nedeniyle) eksik olması durumunda placeholder
   * yerine geçerli bir alternatif render edilmesini sağlar.
   */
  fallbackSrcs?: string[];
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

function BookPlaceholder({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-brand-warm-gray ${className || ""}`}>
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#D4A000"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        <path d="M8 7h6" />
        <path d="M8 11h4" />
      </svg>
    </div>
  );
}

export function ProductImage({
  src,
  fallbackSrcs,
  alt,
  width = 300,
  height = 300,
  className,
  priority,
}: ProductImageProps) {
  // Aday liste: [src, ...fallbacks] — sadece tanımlı/boş-olmayan değerler.
  const candidates = [src, ...(fallbackSrcs ?? [])].filter(
    (s): s is string => !!s && s.length > 0,
  );
  // src prop dışarıdan değişirse component'i yeniden mount etmek
  // tüketenin sorumluluğunda (consumer `key={src}` veriyor — bu durumda
  // idx state'i otomatik sıfırlanır). useEffect ile reset etmiyoruz çünkü
  // react-hooks/set-state-in-effect lint'i bunu yasaklar.
  const [idx, setIdx] = useState(0);
  const current = candidates[idx];

  if (!current) {
    return <BookPlaceholder className={className} />;
  }

  return (
    <Image
      key={current}
      src={current}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      onError={() => {
        // Sıradaki adaya geç; tükenirse placeholder'a düşeriz (idx >= candidates.length).
        setIdx((i) => i + 1);
      }}
      style={{ objectFit: "contain" }}
    />
  );
}
