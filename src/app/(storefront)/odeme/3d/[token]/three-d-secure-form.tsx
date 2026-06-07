"use client";

import { useState } from "react";
import { useCartStore } from "@/stores/cart-store";

interface Props {
  token: string;
  orderId: string;
}

export function ThreeDSecureForm({ token, orderId }: Props) {
  const clearCart = useCartStore((s) => s.clearCart);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState<"success" | "failure" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(action: "success" | "failure") {
    setError(null);
    setLoading(action);
    try {
      const res = await fetch("/api/payments/mock/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action, otp }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Dogrulama başarısız.");
        return;
      }
      if (action === "success") {
        clearCart();
        // Full page replace — kullanıcı back basinca /odeme veya /sepet'e
        // donmesin (sepet bos olduğu için "Sepetiniz bos" gorur).
        window.location.replace(`/odeme/basarili?orderId=${orderId}`);
      } else {
        window.location.replace(`/odeme/basarisiz?orderId=${orderId}`);
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-brand-black mb-1.5">
          Dogrulama Kodu
        </span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6 haneli kod"
          className="w-full px-4 py-3 rounded-lg border border-gray-200 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold"
        />
        <span className="text-xs text-gray-500 mt-1 block">
          Mock PSP: deneme amacli <strong>123456</strong> kullanin.
        </span>
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => confirm("success")}
          disabled={loading !== null || otp.length !== 6}
          className="w-full py-3 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {loading === "success" ? "Dogrulaniyor..." : "Ödemeyi Onayla"}
        </button>
        <button
          onClick={() => confirm("failure")}
          disabled={loading !== null}
          className="w-full py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
        >
          {loading === "failure" ? "İptal ediliyor..." : "Ödemeyi İptal Et"}
        </button>
      </div>
    </div>
  );
}
