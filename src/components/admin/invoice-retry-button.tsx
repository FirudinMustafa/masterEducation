"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InvoiceRetryButton({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "SENT" || status === "CANCELLED") return null;

  async function trigger() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    setBusy(false);
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? "Tekrar gönderim başarısız.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={trigger}
        disabled={busy || pending}
        className="px-3 py-1.5 text-xs font-semibold bg-brand-gold text-brand-black rounded hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
      >
        {busy ? "Gönderiliyor..." : status === "FAILED" ? "Yeniden Gönder" : "Şimdi Gönder"}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}
    </div>
  );
}
