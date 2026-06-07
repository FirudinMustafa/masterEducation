"use client";

import { useState } from "react";
import type { DealerPaymentTerms } from "@prisma/client";

interface Props {
  count: number;
  totalSelected: number;
  onClose: () => void;
  onApply: (payload: {
    paymentTerms: DealerPaymentTerms;
    creditLimit: number;
    notes?: string;
  }) => Promise<void> | void;
  pending: boolean;
}

export function DealersBulkApproveModal({
  count,
  totalSelected,
  onClose,
  onApply,
  pending,
}: Props) {
  const [paymentTerms, setPaymentTerms] = useState<DealerPaymentTerms>("OPEN_ACCOUNT");
  const [creditLimit, setCreditLimit] = useState("0");
  const [notes, setNotes] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-display font-bold text-brand-black">
            Toplu Bayi Onaylama
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{count}</strong> PENDING bayi onaylanacak
            {totalSelected !== count && (
              <> ({totalSelected - count} bayi atlanacak — zaten PENDING değil)</>
            )}
            .
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Ödeme Modu (hepsi için aynı)
          </span>
          <select
            value={paymentTerms}
            onChange={(e) => {
              const v = e.target.value as DealerPaymentTerms;
              setPaymentTerms(v);
              if (v === "PREPAID") setCreditLimit("0");
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="OPEN_ACCOUNT">Cari Hesap (kredi limitli)</option>
            <option value="PREPAID">Peşin (kredi kartı / havale)</option>
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Kredi Limiti (TL)
          </span>
          <input
            type="number"
            min={0}
            max={20_000_000}
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            disabled={paymentTerms === "PREPAID"}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
          />
          {paymentTerms === "PREPAID" && (
            <span className="block text-[11px] text-gray-400 mt-1">
              Peşin modunda gerekli değil.
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Not (opsiyonel — hepsine aynı not düşülür)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={async () => {
              await onApply({
                paymentTerms,
                creditLimit: paymentTerms === "PREPAID" ? 0 : Number(creditLimit) || 0,
                notes: notes.trim() || undefined,
              });
            }}
            disabled={pending || count === 0}
            className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            Onayla ({count})
          </button>
        </div>
      </div>
    </div>
  );
}
