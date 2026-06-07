"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Sipariş bazlı KolayBi taslak fatura aktarım butonu.
 * Invoice kaydı yoksa açar + gönderir (POST /api/admin/orders/[id]/invoice).
 * CANCELLED siparişte / CANCELLED faturada gizli; SENT'te statik onay gösterir
 * (mükerrer aktarım servis tarafından zaten engellenir).
 */
export function OrderInvoiceButton({
  orderId,
  orderStatus,
  invoiceStatus,
}: {
  orderId: string;
  orderStatus: string;
  invoiceStatus: "PENDING" | "SENT" | "FAILED" | "CANCELLED" | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // İptal edilmiş siparişe / iptal faturaya aktarım yok.
  if (orderStatus === "CANCELLED" || invoiceStatus === "CANCELLED") return null;

  // Zaten aktarılmış — mükerrer kayıt servis tarafında engellenir, statik onay.
  if (invoiceStatus === "SENT") {
    return (
      <p className="mt-3 text-xs font-medium text-emerald-700">
        ✓ KolayBi&apos;ye taslak olarak aktarıldı. Resmi e-faturayı KolayBi
        panelinden kesin.
      </p>
    );
  }

  const label = invoiceStatus === "FAILED" ? "Yeniden Aktar" : "KolayBi'ye Aktar (Taslak)";

  async function trigger() {
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch(`/api/admin/orders/${orderId}/invoice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const d = (await res.json().catch(() => ({}))) as {
      status?: string;
      reason?: string;
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setError(d.error ?? "Aktarım başarısız.");
      return;
    }
    if (d.status === "SENT") {
      setMsg("KolayBi'ye taslak fatura kaydı oluşturuldu.");
    } else if (d.status === "PENDING") {
      setMsg(d.reason ?? "KolayBi yapılandırılmadı (DRYRUN) — gönderim yapılmadı.");
    } else if (d.status === "FAILED") {
      setError(d.reason ?? "Aktarım başarısız.");
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
        {busy ? "Aktarılıyor..." : label}
      </button>
      {msg && (
        <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
          {msg}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}
    </div>
  );
}
