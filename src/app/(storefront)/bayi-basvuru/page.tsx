"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/components/location-picker";

export default function DealerApplicationPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
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
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!termsAccepted) {
      setError(
        "Devam etmek icin Üyelik Sözleşmesi ve KVKK Aydınlatma Metni'ni onaylamaniz gerekir."
      );
      return;
    }
    setLoading(true);

    const res = await fetch("/api/dealer/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, termsAccepted, marketingConsent }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Basvuru sirasinda bir hata oluştu.");
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-brand-gold-light flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-gold-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
            Başvurunuz Alındı
          </h1>
          <p className="text-brand-muted mb-6">
            Başvurunuz incelendikten sonra email adresinize bilgilendirme yapılacaktır.
          </p>
          <div className="rounded-lg border border-brand-gold-light bg-brand-gold-light/30 p-4 text-left text-sm text-brand-black">
            <p className="font-semibold mb-1">Sıradaki adım: Belgelerinizi yükleyin</p>
            <p className="text-brand-muted">
              Onay sürecini hızlandırmak için vergi levhanız, ticaret sicil
              gazeteniz ve imza sirküleriniz gibi belgeleri girişten sonra{" "}
              <span className="font-medium">Bayi Paneli &rsaquo; Belgeler</span>{" "}
              sayfasından yükleyebilirsiniz.
            </p>
          </div>
          <div className="mt-6 flex gap-3 justify-center">
            <Link
              href="/giris?callbackUrl=/bayi/belgeler"
              className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark"
            >
              Giriş Yap & Belge Yükle
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 border border-gray-200 text-brand-black rounded-lg text-sm font-semibold hover:bg-gray-50"
            >
              Anasayfa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display font-bold text-brand-black">Bayi Başvurusu</h1>
        <p className="text-brand-muted mt-2">
          Bayi olmak için aşağıdaki formu doldurun. Başvurunuz incelendikten sonra sizinle iletişime geçilecektir.
        </p>
      </div>
      <div className="rounded-lg border border-brand-gold-light bg-brand-gold-light/30 p-4 text-sm mb-6">
        <p className="font-semibold text-brand-black mb-1">Onay sürecini hızlandırmak için</p>
        <p className="text-brand-muted">
          Başvuru sonrası giriş yaparak <span className="font-medium">Bayi Paneli → Belgeler</span> sayfasından
          vergi levhası, ticaret sicil gazetesi ve imza sirküleri yüklemeniz gerekir.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-brand-border/50 p-6 sm:p-8 space-y-6">
        {/* Kisisel Bilgiler */}
        <div>
          <h2 className="text-lg font-semibold text-brand-black mb-4">Kisisel Bilgiler</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input id="name" label="Ad Soyad *" value={form.name} onChange={(e) => update("name", e.target.value)} required />
            <Input id="email" label="Email *" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
            <Input id="phone" label="Telefon *" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
            <Input id="password" label="Şifre *" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required placeholder="En az 6 karakter" />
          </div>
        </div>

        {/* Firma Bilgileri */}
        <div>
          <h2 className="text-lg font-semibold text-brand-black mb-4">Firma Bilgileri</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input id="companyName" label="Firma Adi *" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} required />
            </div>
            <Input id="taxOffice" label="Vergi Dairesi *" value={form.taxOffice} onChange={(e) => update("taxOffice", e.target.value)} required />
            <Input id="taxNumber" label="Vergi Numarasi *" value={form.taxNumber} onChange={(e) => update("taxNumber", e.target.value)} required placeholder="10 veya 11 hane" />
            <Input id="tradeRegNo" label="Ticaret Sicil No" value={form.tradeRegNo} onChange={(e) => update("tradeRegNo", e.target.value)} />
            <Input id="contactPerson" label="Ilgili Kisi" value={form.contactPerson} onChange={(e) => update("contactPerson", e.target.value)} />
          </div>
        </div>

        {/* Adres */}
        <div>
          <h2 className="text-lg font-semibold text-brand-black mb-4">Adres Bilgileri</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <LocationPicker
                province={form.city}
                district={form.district}
                onProvinceChange={(city) => update("city", city)}
                onDistrictChange={(district) => update("district", district)}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Input id="addressLine" label="Acik Adres *" value={form.addressLine} onChange={(e) => update("addressLine", e.target.value)} required />
            </div>
          </div>
        </div>

        {/* Acik riza */}
        <div className="space-y-2.5 border-t border-neutral-100 pt-4">
          <label className="flex items-start gap-2.5 cursor-pointer text-[13px] leading-relaxed text-neutral-700">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-neutral-900"
              required
            />
            <span>
              <Link
                href="/uyelik-sozlesmesi"
                target="_blank"
                className="font-medium underline underline-offset-2 hover:text-neutral-900"
              >
                Üyelik Sözleşmesi
              </Link>
              &apos;ni ve{" "}
              <Link
                href="/kvkk"
                target="_blank"
                className="font-medium underline underline-offset-2 hover:text-neutral-900"
              >
                KVKK Aydınlatma Metni
              </Link>
              &apos;ni okudum, kabul ediyorum.{" "}
              <span className="text-rose-600">*</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer text-[13px] leading-relaxed text-neutral-700">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-neutral-900"
            />
            <span>
              Kampanya, indirim ve yeniliklerden e-posta ile haberdar olmak
              istiyorum.{" "}
              <span className="text-neutral-400">(opsiyonel)</span>
            </span>
          </label>
        </div>

        {error && (
          <p className="text-sm text-brand-danger bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <Button
          type="submit"
          loading={loading}
          disabled={!termsAccepted}
          className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
          size="lg"
        >
          Basvuru Yap
        </Button>
      </form>
    </div>
  );
}
