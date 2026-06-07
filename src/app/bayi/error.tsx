"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DealerErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[bayi] ${error.message}`,
        stack: error.stack ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="max-w-xl mx-auto px-4 py-12 text-center">
      <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-red-100 flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h1 className="text-xl font-display font-bold text-brand-black mb-2">
        Bayi panelinde hata
      </h1>
      <p className="text-brand-muted mb-5 text-sm">
        Beklenmedik bir hata oluştu. Sorun ekibimize iletildi. Sorun devam
        ederse iletişim sayfasindan ulasabilirsiniz.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400 mb-4 font-mono">
          Referans: {error.digest}
        </p>
      )}
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark cursor-pointer text-sm"
        >
          Tekrar Dene
        </button>
        <Link
          href="/bayi"
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50 text-sm"
        >
          Bayi anasayfasi
        </Link>
      </div>
    </div>
  );
}
