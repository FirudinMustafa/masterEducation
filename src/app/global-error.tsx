"use client";

import { useEffect } from "react";

/**
 * Fallback when the root layout itself throws. Minimal markup — we can't
 * rely on Tailwind being bundled or the app shell working.
 */
export default function GlobalError({
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
        message: error.message,
        stack: error.stack ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="tr">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "48px 16px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>
          Sunucu hatasi
        </h1>
        <p style={{ color: "#555", marginBottom: 24 }}>
          Beklenmedik bir hata ile karsilasildi. Kisa bir sure sonra tekrar
          deneyin.
        </p>
        {error.digest && (
          <p style={{ color: "#999", fontFamily: "monospace", fontSize: 12 }}>
            Referans: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            background: "#F5B800",
            color: "#0F0F0F",
            border: 0,
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Tekrar Dene
        </button>
      </body>
    </html>
  );
}
