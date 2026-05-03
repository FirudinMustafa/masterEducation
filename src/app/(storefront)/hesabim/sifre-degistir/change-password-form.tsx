"use client";

import { useState } from "react";

export function ChangePasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (newPassword !== confirm) {
      setError("Yeni sifre ile dogrulama sifresi ayni degil.");
      return;
    }
    setWorking(true);
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    setWorking(false);
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Sifre degistirilemedi.");
      return;
    }
    setSuccess("Sifre guncellendi.");
    setCurrent("");
    setNew("");
    setConfirm("");
  }

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
          Mevcut Sifre
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Yeni Sifre
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
        <span className="text-xs text-gray-500 mt-1 block">
          En az 8 karakter, en az bir harf ve bir rakam.
        </span>
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Yeni Sifre (Tekrar)
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={working || !currentPassword || !newPassword || !confirm}
        className="w-full py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
      >
        {working ? "Kaydediliyor..." : "Sifreyi Degistir"}
      </button>
    </form>
  );
}
