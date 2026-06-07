"use client";

import { useState } from "react";
import { ProductImage } from "./product-image";
import { productImageUrl } from "@/lib/images";

interface GalleryImage {
  id: string;
  filename: string;
}

interface ProductGalleryProps {
  images: GalleryImage[];
  alt: string;
}

export function ProductGallery({ images, alt }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const activeSrc = images[activeIndex]
    ? productImageUrl(images[activeIndex].filename)
    : undefined;

  // 404 fallback chain: aktif image yüklenemezse aynı ürünün diğer
  // image dosyalarına sırayla düşeriz (CSV-disk uyumsuzluğu durumunda
  // placeholder yerine geçerli alternatif). Aktif olanı listeden çıkar.
  const fallbackSrcs = images
    .filter((_, i) => i !== activeIndex)
    .map((img) => productImageUrl(img.filename));

  return (
    <div>
      <div className="bg-white rounded-2xl border border-brand-border/50 p-4 aspect-square flex items-center justify-center sm:p-6">
        <ProductImage
          key={activeSrc ?? "placeholder"}
          src={activeSrc}
          fallbackSrcs={fallbackSrcs}
          alt={alt}
          width={500}
          height={500}
          priority
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {images.map((img, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Gorsel ${i + 1}`}
                aria-pressed={isActive}
                className={`shrink-0 w-16 h-16 rounded-lg border bg-white p-1 overflow-hidden transition-all ${
                  isActive
                    ? "border-brand-gold-dark ring-2 ring-brand-gold/40"
                    : "border-brand-border/50 hover:border-brand-gold-dark/60"
                }`}
              >
                <ProductImage
                  src={productImageUrl(img.filename)}
                  alt={alt}
                  width={64}
                  height={64}
                  className="w-full h-full object-contain"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
