"use client";

import { useState } from "react";
import type { CouponKind } from "@prisma/client";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CouponBulkModal({ onClose, onCreated }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<{
    total: number;
    willCreate: number;
    sample: string[];
    conflicts: string[];
  } | null>(null);

  const [form, setForm] = useState({
    codeTemplate: "SUMMER-{NNN}",
    startNumber: "1",
    count: "10",
    kind: "PERCENT" as CouponKind,
    value: "10",
    minSubtotal: "0",
    maxUses: "1",
    validUntil: "",
  });

  function buildBody(dryRun: boolean) {
    const body: Record<string, unknown> = {
      codeTemplate: form.codeTemplate.trim().toUpperCase(),
      startNumber: Number(form.startNumber) || 1,
      count: Number(form.count) || 0,
      kind: form.kind,
      value: form.kind === "FREE_SHIPPING" ? 0 : Number(form.value),
      minSubtotal: Number(form.minSubtotal) || 0,
      dryRun,
    };
    if (form.maxUses) body.maxUses = Number(form.maxUses);
    if (form.validUntil) {
      const d = new Date(form.validUntil);
      d.setHours(23, 59, 59, 999);
      body.validUntil = d.toISOString();
    }
    return body;
  }

  async function runPreview() {
    setError(null);
    setInfo(null);
    setPreview(null);
    setPending(true);
    const res = await fetch("/api/admin/coupons/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(true)),
    });
    setPending(false);
    const d = (await res.json()) as {
      total?: number;
      willCreate?: number;
      sample?: string[];
      conflicts?: string[];
      error?: string;
    };
    if (!res.ok) {
      setError(d.error ?? "Önizleme başarısız.");
      return;
    }
    setPreview({
      total: d.total ?? 0,
      willCreate: d.willCreate ?? 0,
      sample: d.sample ?? [],
      conflicts: d.conflicts ?? [],
    });
  }

  async function apply() {
    if (!preview || preview.willCreate === 0) return;
    setError(null);
    setInfo(null);
    setPending(true);
    const res = await fetch("/api/admin/coupons/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(false)),
    });
    setPending(false);
    const d = (await res.json()) as {
      created?: number;
      conflicts?: number;
      error?: string;
    };
    if (!res.ok) {
      setError(d.error ?? "Üretim başarısız.");
      return;
    }
    setInfo(
      `${d.created ?? 0} kupon üretildi${d.conflicts ? `, ${d.conflicts} kod zaten vardı atlandı` : ""}.`
    );
    setPreview(null);
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-display font-bold text-brand-black">
            Toplu Kupon Üret
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Tek seferde N farklı kod üretir. Pattern&apos;a <code>{"{NNN}"}</code>{" "}
            (001, 002...) veya <code>{"{N}"}</code> (1, 2...) yaz; pattern yoksa
            otomatik <code>-001</code> suffix eklenir.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {info}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block md:col-span-2">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Kod Pattern
            </span>
            <input
              value={form.codeTemplate}
              onChange={(e) =>
                setForm({ ...form, codeTemplate: e.target.value.toUpperCase() })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
              placeholder="SUMMER-{NNN}"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Başlangıç No
            </span>
            <input
              type="number"
              min={0}
              value={form.startNumber}
              onChange={(e) => setForm({ ...form, startNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Adet
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Tür</span>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: e.target.value as CouponKind })
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="PERCENT">Yüzde</option>
              <option value="FIXED">Sabit Tutar</option>
              <option value="FREE_SHIPPING">Ücretsiz Kargo</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Değer
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
              Min Sepet (TL)
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
              Max Kullanım (her kupon)
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
          <label className="block md:col-span-2">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Son Tarih (opsiyonel)
            </span>
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
        </div>

        {preview && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Üretilecek</span>
              <strong className="text-emerald-700">
                {preview.willCreate} / {preview.total}
              </strong>
            </div>
            {preview.conflicts.length > 0 && (
              <div className="text-xs text-amber-700">
                {preview.conflicts.length} kod zaten mevcut, atlanacak:{" "}
                <span className="font-mono">
                  {preview.conflicts.slice(0, 5).join(", ")}
                  {preview.conflicts.length > 5 ? "…" : ""}
                </span>
              </div>
            )}
            {preview.sample.length > 0 && (
              <div className="text-xs text-gray-500">
                Örnek:{" "}
                <span className="font-mono">
                  {preview.sample.slice(0, 5).join(", ")}
                  {preview.sample.length > 5 ? "…" : ""}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black cursor-pointer"
          >
            İptal
          </button>
          {!preview ? (
            <button
              type="button"
              onClick={runPreview}
              disabled={
                pending || !form.codeTemplate || !form.count
              }
              className="px-5 py-2 bg-brand-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
            >
              Önizle
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={pending}
                className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black cursor-pointer"
              >
                Düzenle
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={pending || preview.willCreate === 0}
                className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
              >
                Üret ({preview.willCreate})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
