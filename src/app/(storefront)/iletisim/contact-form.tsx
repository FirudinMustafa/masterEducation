"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [working, setWorking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWorking(true);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, subject, message }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    setWorking(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Mesaj gonderilemedi.");
      return;
    }
    setSuccess(true);
    setName("");
    setEmail("");
    setPhone("");
    setSubject("");
    setMessage("");
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl border border-brand-border/50 p-6 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="font-display text-xl font-bold text-brand-black mb-1">
          Mesajiniz alindi
        </h3>
        <p className="text-sm text-brand-muted">
          En kisa surede size donus yapacagiz.
        </p>
        <button
          onClick={() => setSuccess(false)}
          className="mt-4 text-sm text-brand-gold-dark hover:underline"
        >
          Yeni mesaj gonder
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-brand-border/50 p-6 space-y-4">
      <h2 className="font-semibold text-brand-black">Bize Yazin</h2>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Ad Soyad</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Telefon (opsiyonel)</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0 5xx xxx xx xx"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Konu</span>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Mesaj</span>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          minLength={10}
          maxLength={2000}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={working}
        className="w-full py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
      >
        {working ? "Gonderiliyor..." : "Mesaji Gonder"}
      </button>
    </form>
  );
}
