"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface DealerPaymentFormProps {
  dealerId: string;
}

export function DealerPaymentForm({ dealerId }: DealerPaymentFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Gecerli bir tutar girin.");
      return;
    }

    const res = await fetch(`/api/admin/dealers/${dealerId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: n, reference, note }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      balanceAfter?: number;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Kaydedilemedi.");
      return;
    }
    setSuccess(
      `Tahsilat kaydedildi. Yeni bakiye: ${data.balanceAfter?.toFixed(2)} TL`
    );
    setAmount("");
    setReference("");
    setNote("");
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
    >
      <h2 className="font-semibold text-brand-black">Tahsilat Girisi</h2>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Tutar (TL) *
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Referans (dekont/havale no)
          </span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Not</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending || !amount}
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
      >
        Tahsilati Kaydet
      </button>
      <p className="text-xs text-gray-500">
        Tahsilat bayinin borcundan dusulur. Hata durumunda tutara eksi vererek
        manuel ayarlama yapabilirsiniz.
      </p>
    </form>
  );
}
