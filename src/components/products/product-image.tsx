"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductImageProps {
  src?: string;
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

export function ProductImage({ src, alt, width = 300, height = 300, className, priority }: ProductImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <BookPlaceholder className={className} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      priority={priority}
      onError={() => setError(true)}
      style={{ objectFit: "contain" }}
    />
  );
}
