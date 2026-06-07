"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { ArrowRightIcon, CheckCircleIconSolid } from "@/components/ui/icons";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Bir hata oluştu.");
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title={sent ? "Email yolda" : "Şifremi unuttum"}
      subtitle={
        sent
          ? "Eger bu email kayıtliysa, birkac dakika icinde sifirlama linkini alacaksiniz."
          : "Email adresinize sifirlama baglantisini gonderelim."
      }
      footer={
        <p className="text-center text-sm text-neutral-500">
          <Link
            href="/giris"
            className="font-semibold text-neutral-900 underline-offset-4 hover:underline"
          >
            Girişe don
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircleIconSolid className="h-8 w-8" />
          </span>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-600">
            <span className="font-semibold text-neutral-900">{email}</span> adresine
            sifirlama linki gonderildi. Mailinizi kontrol edin (spam klasoru dahil).
          </p>
          <button
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="mt-6 text-sm font-medium text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline cursor-pointer"
          >
            Baska bir email kullan
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <FloatingInput
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button
            type="submit"
            loading={loading}
            className="w-full bg-neutral-950 text-white hover:bg-neutral-800 rounded-2xl py-3.5 text-base"
            size="lg"
          >
            Baglanti Gonder
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
