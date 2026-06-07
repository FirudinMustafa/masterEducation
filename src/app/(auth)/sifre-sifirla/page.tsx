"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { ArrowRightIcon, CheckCircleIconSolid } from "@/components/ui/icons";

function ResetPasswordPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Sifirlama başarısız.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/giris"), 1500);
  }

  if (!token) {
    return (
      <AuthShell
        title="Gecersiz baglanti"
        subtitle="Bu şifre sifirlama baglantisi eksik veya bozuk."
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
        <Link
          href="/sifremi-unuttum"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-5 py-3.5 text-base font-semibold text-white hover:bg-neutral-800"
        >
          Yeni baglanti talep et
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={done ? "Şifre güncellendi" : "Yeni şifre belirle"}
      subtitle={
        done
          ? "Yeni şifrenizle giriş yapabilirsiniz."
          : "Hesap guvenliginiz icin guclu bir şifre secin."
      }
      footer={
        !done && (
          <p className="text-center text-sm text-neutral-500">
            <Link
              href="/giris"
              className="font-semibold text-neutral-900 underline-offset-4 hover:underline"
            >
              Girişe don
            </Link>
          </p>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircleIconSolid className="h-8 w-8" />
          </span>
          <p className="mt-5 text-sm text-neutral-600">
            Giriş sayfasina yonlendiriliyorsunuz...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <FloatingInput
            id="password"
            label="Yeni şifre"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            helper="En az 6 karakter"
          />
          <FloatingInput
            id="confirm"
            label="Şifre tekrar"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
          />
          {error && (
            <div className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 space-y-1">
              <p className="font-medium">{error}</p>
              {/(gecersiz|geçersiz|suresi|süresi|dolmus|dolmuş)/i.test(error) && (
                <p className="text-xs">
                  Bu baglantı kullanılmış, suresi dolmus veya yeni bir talep tarafından
                  iptal edilmis olabilir.{" "}
                  <Link
                    href="/sifremi-unuttum"
                    className="font-semibold underline underline-offset-2 hover:no-underline"
                  >
                    Yeni baglantı al
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
          <Button
            type="submit"
            loading={loading}
            className="w-full bg-neutral-950 text-white hover:bg-neutral-800 rounded-2xl py-3.5 text-base"
            size="lg"
          >
            Şifreyi Güncelle
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
