"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DealerStatus, DealerPaymentTerms } from "@prisma/client";
import { useBusy } from "@/lib/hooks/use-busy";
import { useErrorScroll } from "@/lib/hooks/use-error-scroll";

interface DealerActionsProps {
  dealerId: string;
  status: DealerStatus;
  creditLimit: number;
  paymentTerms: DealerPaymentTerms;
  notes: string | null;
  rejectionReason: string | null;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  tradeRegNo: string | null;
  contactPerson: string | null;
}

export function DealerActions({
  dealerId,
  status,
  creditLimit,
  paymentTerms,
  notes,
  rejectionReason,
  companyName,
  taxOffice,
  taxNumber,
  tradeRegNo,
  contactPerson,
}: DealerActionsProps) {
  const router = useRouter();
  // Tek useBusy: yaklasik-anlik approve+reject+suspend+delete butonlari paylasir,
  // boylece in-flight bir aksiyon icindeyken digerleri tetiklenemez (race koruma).
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useErrorScroll(error);
  const [limitInput, setLimitInput] = useState(String(creditLimit));
  const [termsInput, setTermsInput] = useState<DealerPaymentTerms>(paymentTerms);
  const [notesInput, setNotesInput] = useState(notes ?? "");
  const [reasonInput, setReasonInput] = useState(rejectionReason ?? "");
  // Firma bilgileri (API zaten PATCH kabul ediyordu; UI eksikti — D5).
  const [companyNameInput, setCompanyNameInput] = useState(companyName);
  const [taxOfficeInput, setTaxOfficeInput] = useState(taxOffice);
  const [taxNumberInput, setTaxNumberInput] = useState(taxNumber);
  const [tradeRegNoInput, setTradeRegNoInput] = useState(tradeRegNo ?? "");
  const [contactPersonInput, setContactPersonInput] = useState(contactPerson ?? "");

  async function call(path: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(path, {
      method: path.endsWith(`/${dealerId}`) ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Islem başarısız.");
      return;
    }
    router.refresh();
  }

  // TR kullanicilarinin '100.000' yazmasi vs '100000' yazmasi durumlarinda
  // veri kaybi olmasin: binlik nokta/bosluk/virgul karakterlerini temizleyip
  // tek parse noktasi tanimliyoruz. '100.000,00' -> 100000, '100000' -> 100000.
  const parseLimitInput = (raw: string): number => {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    // Binlik ayiraci nokta veya bosluk olabilir; ondalik ayraci virgul.
    const normalized = trimmed
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "") // binlik nokta sil (yalniz 3'lu gruplar)
      .replace(",", ".");
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n); // kurus girilse bile tam sayiya yuvarla (limit TL)
  };

  const approve = () =>
    run(() =>
      call(`/api/admin/dealers/${dealerId}/approve`, {
        paymentTerms: termsInput,
        creditLimit: termsInput === "PREPAID" ? 0 : parseLimitInput(limitInput),
        notes: notesInput || undefined,
      })
    );

  const reject = () =>
    run(() =>
      call(`/api/admin/dealers/${dealerId}/reject`, {
        rejectionReason: reasonInput || undefined,
        notes: notesInput || undefined,
      })
    );

  const suspend = () =>
    run(() =>
      call(`/api/admin/dealers/${dealerId}/suspend`, {
        notes: notesInput || undefined,
      })
    );

  const saveDetails = () =>
    run(() =>
      call(`/api/admin/dealers/${dealerId}`, {
        companyName: companyNameInput.trim(),
        taxOffice: taxOfficeInput.trim(),
        taxNumber: taxNumberInput.replace(/\s/g, ""),
        tradeRegNo: tradeRegNoInput.trim() || null,
        contactPerson: contactPersonInput.trim() || null,
        paymentTerms: termsInput,
        creditLimit: termsInput === "PREPAID" ? 0 : parseLimitInput(limitInput),
        notes: notesInput || undefined,
      })
    );

  async function deleteDealer() {
    if (
      !confirm(
        "Bayiyi tamamen sil?\n\n" +
          "Otomatik yapilacaklar:\n" +
          "• Aktif siparişleri (Bekliyor/Onaylandi/Hazirlaniyor/Kargoda) IPTAL edilir, stok geri yüklenir.\n" +
          "• Tamamlanmis (Teslim) ama tahsil edilmemis siparişlerin paymentStatus 'Başarısız' olur.\n" +
          "• Cari hareketleri, iskontolari ve belgeleri silinir.\n" +
          "• Kullanıcı 'Musteri' rolune dusurulur, gecmis siparişleri hesabinda kalir.\n\n" +
          "GERI DONUSU YOK. Devam edilsin mi?"
      )
    ) {
      return;
    }
    await run(async () => {
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
          `Bayi silindi. ${data.cancelledOrders} aktif sipariş iptal edildi, ${data.ledgerEntriesPurged ?? 0} cari hareket temizlendi.`
        );
      }
      router.push("/admin/bayiler");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div ref={errorRef} className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block md:col-span-2">
          <span className="block text-xs font-medium text-gray-500 mb-1">Firma Adı</span>
          <input
            type="text"
            value={companyNameInput}
            onChange={(e) => setCompanyNameInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Vergi Dairesi</span>
          <input
            type="text"
            value={taxOfficeInput}
            onChange={(e) => setTaxOfficeInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Vergi / TC No</span>
          <input
            type="text"
            value={taxNumberInput}
            onChange={(e) => setTaxNumberInput(e.target.value)}
            placeholder="10-11 hane"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-brand-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Yetkili Kişi</span>
          <input
            type="text"
            value={contactPersonInput}
            onChange={(e) => setContactPersonInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Ticaret Sicil No</span>
          <input
            type="text"
            value={tradeRegNoInput}
            onChange={(e) => setTradeRegNoInput(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Ödeme Modu</span>
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
              ? "Bayi her sipariş icin kredi karti veya havale ile oder."
              : "Bayi sipariş verir, asagidaki limitten dusulur — sonradan oder."}
          </span>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Kredi Limiti (TL)</span>
          <input
            type="text"
            inputMode="decimal"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            disabled={termsInput === "PREPAID"}
            placeholder="Ornek: 100000"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:border-brand-gold"
          />
          {termsInput === "PREPAID" ? (
            <span className="block text-[11px] text-gray-400 mt-1">
              Pesin modunda gerekli degil.
            </span>
          ) : (
            <span className="block text-[11px] text-gray-500 mt-1">
              Kaydedilecek: <strong>{parseLimitInput(limitInput).toLocaleString("tr-TR")} ₺</strong>
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
            disabled={busy}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 cursor-pointer"
          >
            Onayla
          </button>
        )}
        {status !== "REJECTED" && status !== "APPROVED" && (
          <button
            onClick={reject}
            disabled={busy}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
          >
            Reddet
          </button>
        )}
        {status === "APPROVED" && (
          <button
            onClick={suspend}
            disabled={busy}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
          >
            Askiya Al
          </button>
        )}
        <button
          onClick={saveDetails}
          disabled={busy}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
        >
          Bilgileri Kaydet
        </button>
        <button
          onClick={deleteDealer}
          disabled={busy}
          className="ml-auto px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 cursor-pointer"
        >
          Bayiyi Sil
        </button>
      </div>
    </div>
  );
}
