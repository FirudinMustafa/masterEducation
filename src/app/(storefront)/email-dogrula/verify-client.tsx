"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Props {
  token: string;
}

export function VerifyClient({ token }: Props) {
  const [state, setState] = useState<"working" | "success" | "failed">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (res.ok && data.ok) {
          setState("success");
        } else {
          setError(data.error ?? "Dogrulama başarısız.");
          setState("failed");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Baglanti hatasi.");
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center">
      {state === "working" && (
        <>
          <div className="mx-auto mb-6 h-12 w-12 rounded-full border-4 border-gray-200 border-t-brand-gold animate-spin" />
          <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
            Email dogrulaniyor...
          </h1>
        </>
      )}

      {state === "success" && (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
            Email adresiniz dogrulandi
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Artik tüm hesap özellikleri aktif.
          </p>
          <Link
            href="/hesabim"
            className="inline-flex px-5 py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark"
          >
            Hesabıma git
          </Link>
        </>
      )}

      {state === "failed" && (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
            Dogrulama başarısız
          </h1>
          <p className="text-sm text-red-700 mb-6">{error}</p>
          <Link
            href="/hesabim"
            className="inline-flex px-5 py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark"
          >
            Hesabıma git
          </Link>
          <p className="text-xs text-gray-500 mt-3">
            Hesabinizdan yeni bir dogrulama maili isteyebilirsiniz.
          </p>
        </>
      )}
    </div>
  );
}
