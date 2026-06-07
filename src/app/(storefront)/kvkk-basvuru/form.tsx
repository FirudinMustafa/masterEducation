"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/stores/toast-store";

type Channel = "email" | "post";
type RequestType =
  | "INFO_REQUEST"
  | "CORRECTION"
  | "DELETION"
  | "TRANSFER_INFO"
  | "OBJECTION"
  | "DAMAGE_COMPENSATION"
  | "OTHER";

const REQUEST_TYPES: { value: RequestType; label: string }[] = [
  { value: "INFO_REQUEST", label: "Verilerimin islenip islenmedigini ogrenmek istiyorum" },
  { value: "CORRECTION", label: "Verilerimin duzeltilmesini istiyorum" },
  { value: "DELETION", label: "Verilerimin silinmesini / yok edilmesini istiyorum" },
  { value: "TRANSFER_INFO", label: "Verilerimin aktarildigi ucuncu kisileri ogrenmek istiyorum" },
  { value: "OBJECTION", label: "Otomatik sistemle aleyhime cikan bir sonuca itiraz ediyorum" },
  { value: "DAMAGE_COMPENSATION", label: "Kanuna aykiri islenme nedeniyle zararin giderilmesini talep ediyorum" },
  { value: "OTHER", label: "Diger" },
];

export function KvkkApplicationForm() {
  const [form, setForm] = useState({
    fullName: "",
    tckn: "",
    email: "",
    phone: "",
    address: "",
    relationship: "",
    requestType: "INFO_REQUEST" as RequestType,
    detail: "",
    channel: "email" as Channel,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.fullName || !form.email || !form.detail) {
      setError("Lütfen zorunlu alanlari doldurun.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/kvkk-basvuru", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Basvuru iletilirken bir hata oluştu.");
      }
      setSubmitted(true);
      toast.success("Basvurunuz alindi", "30 gün icinde tarafiniza donus yapilacaktir.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-7 w-7 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-display font-semibold text-emerald-900 mb-1">
          Basvurunuz alindi
        </h2>
        <p className="text-sm text-emerald-800">
          KVKK basvurunuz tarafimiza ulasti. KVKK madde 13/2 uyarınca en gec{" "}
          <strong>30 gün</strong> icinde tarafiniza donus yapilacaktir.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 sm:p-7 space-y-5"
    >
      <section>
        <h2 className="text-base font-display font-semibold text-brand-black mb-3">
          Kimlik Bilgileri
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Ad Soyad *"
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            required
            maxLength={120}
          />
          <Input
            label="TC Kimlik No (opsiyonel)"
            value={form.tckn}
            onChange={(e) => update("tckn", e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="11 haneli"
            maxLength={11}
            inputMode="numeric"
          />
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            maxLength={200}
          />
          <Input
            label="Telefon"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-brand-black mb-1.5">
            Tebligat Adresi
          </label>
          <textarea
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm text-brand-black placeholder:text-brand-muted/60 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
          />
        </div>
        <div className="mt-4">
          <Input
            label="Sirketimizle Iliskiniz"
            placeholder="Musteri / bayi / calisan / ziyaretci"
            value={form.relationship}
            onChange={(e) => update("relationship", e.target.value)}
            maxLength={120}
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-display font-semibold text-brand-black mb-3">
          Talebin Konusu
        </h2>
        <div className="space-y-2">
          {REQUEST_TYPES.map((rt) => (
            <label
              key={rt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                form.requestType === rt.value
                  ? "border-brand-gold bg-brand-gold-light/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="requestType"
                value={rt.value}
                checked={form.requestType === rt.value}
                onChange={() => update("requestType", rt.value)}
                className="mt-0.5"
              />
              <span>{rt.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <label className="block text-sm font-medium text-brand-black mb-1.5">
          Talebinizi Detayli Açıklayin *
        </label>
        <textarea
          value={form.detail}
          onChange={(e) => update("detail", e.target.value)}
          rows={5}
          required
          maxLength={3000}
          placeholder="Hangi verilere iliskin, hangi tarihteki islemler hakkinda bilgi/duzeltme/silme talep ettiginizi mumkun oldugunca somut sekilde belirtin."
          className="w-full rounded-lg border border-brand-border bg-white px-4 py-2.5 text-sm text-brand-black placeholder:text-brand-muted/60 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
        />
        <p className="mt-1 text-xs text-brand-muted">
          {form.detail.length}/3000 karakter
        </p>
      </section>

      <section>
        <label className="block text-sm font-medium text-brand-black mb-2">
          Cevabin Tarafiniza Iletilmesini İştediginiz Yontem
        </label>
        <div className="flex gap-3">
          {(["email", "post"] as Channel[]).map((c) => (
            <label
              key={c}
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm ${
                form.channel === c
                  ? "border-brand-gold bg-brand-gold-light/20"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="channel"
                checked={form.channel === c}
                onChange={() => update("channel", c)}
              />
              {c === "email" ? "E-posta ile" : "Posta ile"}
            </label>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-brand-muted">
        Basvurumu KVKK madde 11&apos;de yazili haklarim cercevesinde,
        ayrintilarinin dogru oldugunu beyan ederek yapiyorum. Verdigim bilgilerin
        dogrulanmasi icin kimligimin tevsik edilmesini kabul ederim.
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={loading} size="lg">
          Basvuruyu Gonder
        </Button>
      </div>
    </form>
  );
}
