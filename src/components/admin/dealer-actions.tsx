"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DealerStatus, DealerPaymentTerms } from "@prisma/client";

interface DealerActionsProps {
  dealerId: string;
  status: DealerStatus;
  creditLimit: number;
  paymentTerms: DealerPaymentTerms;
  notes: string | null;
  rejectionReason: string | null;
}

export function DealerActions({
  dealerId,
  status,
  creditLimit,
  paymentTerms,
  notes,
  rejectionReason,
}: DealerActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [limitInput, setLimitInput] = useState(String(creditLimit));
  const [termsInput, setTermsInput] = useState<DealerPaymentTerms>(paymentTerms);
  const [notesInput, setNotesInput] = useState(notes ?? "");
  const [reasonInput, setReasonInput] = useState(rejectionReason ?? "");

  async function call(path: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(path, {
      method: path.endsWith(`/${dealerId}`) ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Islem basarisiz.");
      return;
    }
    startTransition(() => router.refresh());
  }

  const approve = () =>
    call(`/api/admin/dealers/${dealerId}/approve`, {
      paymentTerms: termsInput,
      creditLimit: termsInput === "PREPAID" ? 0 : Number(limitInput) || 0,
      notes: notesInput || undefined,
    });

  const reject = () =>
    call(`/api/admin/dealers/${dealerId}/reject`, {
      rejectionReason: reasonInput || undefined,
      notes: notesInput || undefined,
    });

  const suspend = () =>
    call(`/api/admin/dealers/${dealerId}/suspend`, {
      notes: notesInput || undefined,
    });

  const saveDetails = () =>
    call(`/api/admin/dealers/${dealerId}`, {
      paymentTerms: termsInput,
      creditLimit: termsInput === "PREPAID" ? 0 : Number(limitInput) || 0,
      notes: notesInput || undefined,
    });

  async function deleteDealer() {
    if (
      !confirm(
        "Bayiyi tamamen sil?\n\n" +
          "Otomatik yapilacaklar:\n" +
          "• Aktif siparisleri (Bekliyor/Onaylandi/Hazirlaniyor/Kargoda) IPTAL edilir, stok geri yuklenir.\n" +
          "• Tamamlanmis (Teslim) ama tahsil edilmemis siparislerin paymentStatus 'Basarisiz' olur.\n" +
          "• Cari hareketleri, iskontolari ve belgeleri silinir.\n" +
          "• Kullanici 'Musteri' rolune dusurulur, gecmis siparisleri hesabinda kalir.\n\n" +
          "GERI DONUSU YOK. Devam edilsin mi?"
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/dealers/${dealerId}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      cancelledOrders?: number;
      ledgerEntriesPurged?: number;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Silinemedi.");
      return;
    }
    if (data.cancelledOrders && data.cancelledOrders > 0) {
      alert(
        `Bayi silindi. ${data.cancelledOrders} aktif siparis iptal edildi, ${data.ledgerEntriesPurged ?? 0} cari hareket temizlendi.`
      );
    }
    router.push("/admin/bayiler");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Odeme Modu</span>
          <select
            value={termsInput}
            onChange={(e) => {
              const v = e.target.value as DealerPaymentTerms;
              setTermsInput(v);
              if (v === "PREPAID") setLimitInput("0");
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-brand-gold"
          >
            <option value="OPEN_ACCOUNT">Cari Hesap (kredi limiti)</option>
            <option value="PREPAID">Pesin (kredi karti / havale)</option>
          </select>
          <span className="block text-[11px] text-gray-400 mt-1">
            {termsInput === "PREPAID"
              ? "Bayi her siparis icin kredi karti veya havale ile oder."
              : "Bayi siparis verir, asagidaki limitten dusulur — sonradan oder."}
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Kredi Limiti (TL)</span>
          <input
            type="number"
            min={0}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            disabled={termsInput === "PREPAID"}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:border-brand-gold"
          />
          {termsInput === "PREPAID" && (
            <span className="block text-[11px] text-gray-400 mt-1">
              Pesin modunda gerekli degil.
            </span>
          )}
        </label>
        <label className="block md:col-span-2">
          <span className="block text-xs font-medium text-gray-500 mb-1">Ret Nedeni</span>
          <input
            type="text"
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Admin Notu</span>
        <textarea
          rows={2}
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {status !== "APPROVED" && (
          <button
            onClick={approve}
            disabled={pending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            Onayla
          </button>
        )}
        {status !== "REJECTED" && status !== "APPROVED" && (
          <button
            onClick={reject}
            disabled={pending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            Reddet
          </button>
        )}
        {status === "APPROVED" && (
          <button
            onClick={suspend}
            disabled={pending}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
          >
            Askiya Al
          </button>
        )}
        <button
          onClick={saveDetails}
          disabled={pending}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
        >
          Bilgileri Kaydet
        </button>
        <button
          onClick={deleteDealer}
          disabled={pending}
          className="ml-auto px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
        >
          Bayiyi Sil
        </button>
      </div>
    </div>
  );
}
