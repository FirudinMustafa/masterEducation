"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CouponKind } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { CouponBulkModal } from "./coupon-bulk-modal";
import { useBusy } from "@/lib/hooks/use-busy";

export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
  isActive: boolean;
}

const KIND_LABELS: Record<CouponKind, string> = {
  PERCENT: "Yuzde",
  FIXED: "Sabit Tutar",
  FREE_SHIPPING: "Ücretsiz Kargo",
};

export function CouponManager({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Tek useBusy: oluştur + toggle + sil ortak guard. Bir aksiyon in-flight
  // iken digerleri tetiklenemez (double-submit / yarisma korunmasi).
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({
    code: "",
    kind: "PERCENT" as CouponKind,
    value: "10",
    minSubtotal: "0",
    maxUses: "",
    validFrom: "",
    validUntil: "",
    isActive: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      setError(null);
      const body: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value: Number(form.value),
        minSubtotal: Number(form.minSubtotal),
        isActive: form.isActive,
      };
      if (form.maxUses) body.maxUses = Number(form.maxUses);
      if (form.validFrom) {
        // Başlangıç günün sıfırıncı saniyesi.
        const d = new Date(form.validFrom);
        d.setHours(0, 0, 0, 0);
        body.validFrom = d.toISOString();
      }
      if (form.validUntil) {
        // Girilen tarih günun sonuna kadar gecerli (yoksa ayni gün 00:00'da
        // expired gözukur, saat 10:00'da oluşan "bugun gecerli" kupon calismaz).
        const d = new Date(form.validUntil);
        d.setHours(23, 59, 59, 999);
        body.validUntil = d.toISOString();
      }

      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Kupon oluşturulamadi.");
        return;
      }
      setForm({ ...form, code: "", validFrom: "", validUntil: "" });
      router.refresh();
    });
  }

  async function toggle(c: CouponRow) {
    await run(async () => {
      const res = await fetch(`/api/admin/coupons/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Güncellenemedi.");
        return;
      }
      router.refresh();
    });
  }

  async function remove(c: CouponRow) {
    if (
      !confirm(
        `${c.code} silinsin mi? Kullanilmis kuponlar silinmez, pasiflestirilir.`
      )
    ) {
      return;
    }
    await run(async () => {
      const res = await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Silinemedi.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowBulk(true)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 cursor-pointer"
        >
          + Toplu Üret
        </button>
      </div>

      {showBulk && (
        <CouponBulkModal
          onClose={() => setShowBulk(false)}
          onCreated={() => {
            setShowBulk(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <form
        onSubmit={submit}
        className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
      >
        <label className="block md:col-span-2">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Kod *
          </span>
          <input
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
            required
            placeholder="YAZ20"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Tur</span>
          <select
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as CouponKind })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="PERCENT">Yuzde</option>
            <option value="FIXED">Sabit</option>
            <option value="FREE_SHIPPING">Ücretsiz Kargo</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Deger
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            disabled={form.kind === "FREE_SHIPPING"}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Min Sepet
          </span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.minSubtotal}
            onChange={(e) => setForm({ ...form, minSubtotal: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Max Kullanim
          </span>
          <input
            type="number"
            min={1}
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            placeholder="limitsiz"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Başlangıç
          </span>
          <input
            type="date"
            value={form.validFrom}
            onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Son Tarih
          </span>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !form.code}
          className="md:col-span-6 sm:col-auto px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          Oluştur
        </button>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 uppercase text-xs">
              <th className="text-left p-3">Kod</th>
              <th className="text-left p-3">Tur</th>
              <th className="text-right p-3">Deger</th>
              <th className="text-right p-3">Min</th>
              <th className="text-right p-3">Kullanim</th>
              <th className="text-left p-3">Gecerlilik</th>
              <th className="text-center p-3">Durum</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Henuz kupon yok.
                </td>
              </tr>
            )}
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-gray-50">
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3">{KIND_LABELS[c.kind]}</td>
                <td className="p-3 text-right">
                  {c.kind === "PERCENT"
                    ? `%${c.value}`
                    : c.kind === "FIXED"
                      ? formatPrice(c.value)
                      : "—"}
                </td>
                <td className="p-3 text-right text-gray-600">
                  {c.minSubtotal > 0 ? formatPrice(c.minSubtotal) : "—"}
                </td>
                <td className="p-3 text-right text-gray-600">
                  {c.usedCount}
                  {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {c.validFrom
                    ? new Date(c.validFrom).toLocaleDateString("tr-TR")
                    : "—"}
                  {" → "}
                  {c.validUntil
                    ? new Date(c.validUntil).toLocaleDateString("tr-TR")
                    : "süresiz"}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => toggle(c)}
                    disabled={busy}
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 ${
                      c.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {c.isActive ? "Aktif" : "Pasif"}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => remove(c)}
                    disabled={busy}
                    className="text-xs text-red-600 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
