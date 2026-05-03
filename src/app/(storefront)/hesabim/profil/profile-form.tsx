"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  initial: { name: string; email: string; phone: string };
  emailVerified: boolean;
}

export function ProfileForm({ initial, emailVerified }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const emailChanged = email !== initial.email;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        ...(emailChanged ? { currentPassword } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      emailChanged?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Profil guncellenemedi.");
      return;
    }
    setSuccess(
      data.emailChanged
        ? "Profil guncellendi. Yeni email icin dogrulama gondeirilecek."
        : "Profil guncellendi."
    );
    setCurrentPassword("");
    startTransition(() => router.refresh());
  }

  const changed =
    name !== initial.name || email !== initial.email || phone !== initial.phone;

  return (
    <form onSubmit={submit} className="space-y-4">
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

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Ad Soyad
        </span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Email
          {emailVerified ? (
            <span className="ml-2 text-xs text-green-700">dogrulandi</span>
          ) : (
            <span className="ml-2 text-xs text-amber-700">dogrulanmadi</span>
          )}
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Telefon
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0 5xx xxx xx xx"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      {emailChanged && (
        <label className="block">
          <span className="block text-sm font-medium text-brand-black mb-1">
            Mevcut sifre
            <span className="ml-1 text-xs text-gray-500">
              (email degistiriyorsunuz, guvenlik icin gerekli)
            </span>
          </span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
          />
        </label>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || !changed || (emailChanged && !currentPassword)}
          className="px-5 py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {pending ? "Kaydediliyor..." : "Kaydet"}
        </button>
        {!changed && (
          <span className="text-xs text-gray-500">Degisiklik yok</span>
        )}
      </div>
    </form>
  );
}
