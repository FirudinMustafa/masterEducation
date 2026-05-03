"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";

interface ParseLine {
  sku: string;
  quantity: number;
  productId: string | null;
  productName: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  ok: boolean;
  error: string | null;
}

interface ParseResponse {
  lines: ParseLine[];
  summary: {
    totalRows: number;
    okRows: number;
    failedRows: number;
    subtotal: number;
    total: number;
  };
  parseErrors: string[];
}

interface Props {
  defaultEmail: string;
  defaultName: string;
  defaultAddress: {
    phone: string;
    city: string;
    district: string;
    postalCode: string;
    address: string;
  } | null;
}

export function BulkOrderForm({
  defaultEmail,
  defaultName,
  defaultAddress,
}: Props) {
  const router = useRouter();
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [parse, setParse] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState({
    fullName: defaultName,
    email: defaultEmail,
    phone: defaultAddress?.phone ?? "",
    city: defaultAddress?.city ?? "",
    district: defaultAddress?.district ?? "",
    postalCode: defaultAddress?.postalCode ?? "",
    address: defaultAddress?.address ?? "",
  });
  const [note, setNote] = useState("");

  async function handleUpload(file: File) {
    setError(null);
    setParse(null);
    setParsing(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/dealer/bulk-order/parse", {
      method: "POST",
      body: fd,
    });
    setParsing(false);
    const data = (await res.json().catch(() => ({}))) as
      | (ParseResponse & { error?: string })
      | { error?: string };
    if (!res.ok) {
      setError(("error" in data && data.error) || "Excel islenemedi.");
      return;
    }
    setParse(data as ParseResponse);
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!parse) return;
    setError(null);

    const items = parse.lines
      .filter((l) => l.ok && l.productId)
      .map((l) => ({ productId: l.productId!, quantity: l.quantity }));

    if (items.length === 0) {
      setError("Onaylanabilecek satir yok.");
      return;
    }

    if (!shipping.fullName || !shipping.phone || !shipping.city || !shipping.address) {
      setError("Teslimat bilgileri eksik.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/dealer/bulk-order/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, shipping, note }),
    });
    setSubmitting(false);
    const data = (await res.json().catch(() => ({}))) as {
      orderId?: string;
      orderNumber?: string;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Siparis olusturulamadi.");
      return;
    }
    router.replace(`/bayi/siparisler`);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/dealer/bulk-order/template"
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Sablon Indir
          </a>
          <label className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark cursor-pointer">
            {parsing ? "Okunuyor..." : "Excel Yukle"}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={parsing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleUpload(file);
              }}
            />
          </label>
          {parse && (
            <span className="text-sm text-gray-500">
              {parse.summary.okRows} / {parse.summary.totalRows} satir onaylandi ·
              Toplam {formatPrice(parse.summary.total)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {parse && parse.parseErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold mb-1">Ayristirma uyarilari:</p>
          <ul className="list-disc list-inside text-xs space-y-0.5">
            {parse.parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {parse && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                <th className="text-left p-3">ISBN</th>
                <th className="text-left p-3">Urun</th>
                <th className="text-right p-3">Adet</th>
                <th className="text-right p-3">Birim</th>
                <th className="text-right p-3">Tutar</th>
                <th className="text-left p-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {parse.lines.map((l) => (
                <tr
                  key={l.sku}
                  className={`border-b border-gray-50 ${l.ok ? "" : "bg-red-50/40"}`}
                >
                  <td className="p-3 font-mono text-xs">{l.sku}</td>
                  <td className="p-3 line-clamp-1">{l.productName ?? "-"}</td>
                  <td className="p-3 text-right">{l.quantity}</td>
                  <td className="p-3 text-right">
                    {l.unitPrice != null ? formatPrice(l.unitPrice) : "-"}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {l.lineTotal != null ? formatPrice(l.lineTotal) : "-"}
                  </td>
                  <td className="p-3 text-xs">
                    {l.ok ? (
                      <span className="text-emerald-700">OK</span>
                    ) : (
                      <span className="text-red-600">{l.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parse && parse.summary.okRows > 0 && (
        <form
          onSubmit={submitOrder}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h2 className="font-semibold text-brand-black">Teslimat Bilgileri</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField
              label="Ad Soyad / Firma"
              value={shipping.fullName}
              onChange={(v) => setShipping({ ...shipping, fullName: v })}
              required
            />
            <TextField
              label="Email"
              type="email"
              value={shipping.email}
              onChange={(v) => setShipping({ ...shipping, email: v })}
              required
            />
            <TextField
              label="Telefon"
              value={shipping.phone}
              onChange={(v) => setShipping({ ...shipping, phone: v })}
              required
            />
            <TextField
              label="Sehir"
              value={shipping.city}
              onChange={(v) => setShipping({ ...shipping, city: v })}
              required
            />
            <TextField
              label="Ilce"
              value={shipping.district}
              onChange={(v) => setShipping({ ...shipping, district: v })}
            />
            <TextField
              label="Posta Kodu"
              value={shipping.postalCode}
              onChange={(v) => setShipping({ ...shipping, postalCode: v })}
            />
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Adres *
            </span>
            <textarea
              value={shipping.address}
              onChange={(e) =>
                setShipping({ ...shipping, address: e.target.value })
              }
              rows={2}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Siparis Notu
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>

          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500">
                {parse.summary.okRows} satir siparis olusturulacak
              </p>
              <p className="text-lg font-bold text-brand-black">
                Toplam: {formatPrice(parse.summary.total)}
              </p>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Siparis olusturuluyor..." : "Acik Hesap ile Onayla"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      />
    </label>
  );
}
