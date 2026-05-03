"use client";

import { useState } from "react";

export function EmailVerifyBanner() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    setSending(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Mail gonderilemedi.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 mt-0.5 text-amber-600 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div className="text-sm">
            <p className="font-semibold text-amber-900">
              Email adresiniz henuz dogrulanmadi
            </p>
            <p className="text-amber-800 mt-0.5">
              Hesap guvenligi icin email&apos;inizdeki dogrulama baglantisina tiklayin.
            </p>
            {sent && (
              <p className="text-green-700 mt-2">
                Yeni dogrulama maili gonderildi.
              </p>
            )}
            {error && <p className="text-red-700 mt-2">{error}</p>}
          </div>
        </div>
        {!sent && (
          <button
            onClick={resend}
            disabled={sending}
            className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
          >
            {sending ? "Gonderiliyor..." : "Tekrar gonder"}
          </button>
        )}
      </div>
    </div>
  );
}
