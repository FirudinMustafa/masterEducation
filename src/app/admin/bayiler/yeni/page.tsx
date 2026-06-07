"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type PaymentTerms = "OPEN_ACCOUNT" | "PREPAID";
type DealerStatus = "APPROVED" | "PENDING";

export default function NewDealerPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    companyName: "",
    taxOffice: "",
    taxNumber: "",
    tradeRegNo: "",
    contactPerson: "",
    city: "",
    district: "",
    addressLine: "",
    notes: "",
  });
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>("OPEN_ACCOUNT");
  const [creditLimit, setCreditLimit] = useState("0");
  const [status, setStatus] = useState<DealerStatus>("APPROVED");

  function set(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          paymentTerms,
          creditLimit: Number(creditLimit) || 0,
          status,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Bayi oluşturulamadı.");
        return;
      }
      router.push("/admin/bayiler");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/bayiler" className="text-sm text-gray-500 hover:text-brand-black">
          &larr; Bayiler
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-display font-bold text-brand-black">
        Yeni Bayi Ekle
      </h1>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-brand-black">Giriş Bilgileri</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Yetkili Ad Soyad *" value={form.name} onChange={(v) => set("name", v)} required />
            <Field label="E-posta *" type="email" value={form.email} onChange={(v) => set("email", v)} required />
            <Field label="Telefon *" value={form.phone} onChange={(v) => set("phone", v)} required />
            <Field label="Şifre *" value={form.password} onChange={(v) => set("password", v)} required placeholder="En az 8 karakter" />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-brand-black">Firma Bilgileri</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Firma Adı *" value={form.companyName} onChange={(v) => set("companyName", v)} required />
            <Field label="Yetkili Kişi" value={form.contactPerson} onChange={(v) => set("contactPerson", v)} />
            <Field label="Vergi Dairesi *" value={form.taxOffice} onChange={(v) => set("taxOffice", v)} required />
            <Field label="Vergi / TC No *" value={form.taxNumber} onChange={(v) => set("taxNumber", v)} required placeholder="10-11 hane" />
            <Field label="Ticaret Sicil No" value={form.tradeRegNo} onChange={(v) => set("tradeRegNo", v)} />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-brand-black">Fatura Adresi (opsiyonel)</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="İl" value={form.city} onChange={(v) => set("city", v)} />
            <Field label="İlçe" value={form.district} onChange={(v) => set("district", v)} />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Açık Adres</label>
            <textarea
              value={form.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-brand-black">Bayilik Ayarları</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Durum</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DealerStatus)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="APPROVED">Onaylı (giriş yapabilir)</option>
                <option value="PENDING">Beklemede</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Ödeme Modu</label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value as PaymentTerms)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <option value="OPEN_ACCOUNT">Cari Hesap</option>
                <option value="PREPAID">Peşin</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Kredi Limiti (₺)
              </label>
              <input
                type="number"
                min={0}
                max={20_000_000}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                disabled={paymentTerms === "PREPAID"}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Admin Notu</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link
            href="/admin/bayiler"
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            İptal
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-semibold text-brand-black hover:bg-brand-gold-dark disabled:opacity-50"
          >
            {busy ? "Oluşturuluyor..." : "Bayi Oluştur"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
