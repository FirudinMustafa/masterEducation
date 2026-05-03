"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { useRecentlyViewedStore } from "@/stores/recently-viewed-store";

export function DeleteAccountForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWorking(true);
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirm }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      strategy?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Hesap silinemedi.");
      setWorking(false);
      return;
    }
    // Oturumu kapat ve anasayfaya yonlendir — once tum client store'lari temizle
    useCartStore.getState().clearCart();
    useWishlistStore.getState().clear();
    useCompareStore.getState().clear();
    useRecentlyViewedStore.getState().clear();
    await signOut({ redirect: false });
    window.location.href = "/?hesap=silindi";
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Sifreniz
        </span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1">
          Onay metni
        </span>
        <p className="text-xs text-gray-500 mb-1">
          Silmek icin asagiya aynen <strong>HESABIMI SIL</strong> yazin.
        </p>
        <input
          type="text"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="HESABIMI SIL"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono"
        />
      </label>

      <button
        type="submit"
        disabled={working || confirm !== "HESABIMI SIL" || !password}
        className="w-full py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
      >
        {working ? "Siliniyor..." : "Hesabi Kalici Olarak Sil"}
      </button>
    </form>
  );
}
