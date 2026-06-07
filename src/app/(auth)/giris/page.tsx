"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { safeCallbackUrl } from "@/lib/safe-callback";
import {
  CheckCircleIconSolid,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import { toast } from "@/stores/toast-store";

function LoginPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const justRegistered = sp.get("kayıt") === "başarıli";
  const isDealerEntry = sp.get("bayi") === "1";
  const rawCallback = sp.get("callbackUrl");
  const callbackUrl = safeCallbackUrl(rawCallback ?? (isDealerEntry ? "/bayi" : "/"));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Email veya şifre hatali.");
    } else {
      toast.success("Hoşgeldiniz");
      try {
        const r = await fetch("/api/auth/session");
        const s = await r.json();
        const role = s?.user?.role;
        if (role === "ADMIN") router.push("/admin");
        else if (role === "DEALER") router.push("/bayi");
        else router.push(callbackUrl);
      } catch {
        router.push(callbackUrl);
      }
      router.refresh();
    }
  }

  return (
    <AuthShell
      title="Bayi Girişi"
      subtitle="Bayi hesabınızla giriş yapın."
    >
      {justRegistered && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircleIconSolid className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span>Kaydiniz oluşturuldu. Email ve şifrenizle giriş yapabilirsiniz.</span>
        </div>
      )}

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
        <FloatingInput
          id="password"
          label="Şifre"
          type={showPass ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Şifreyi gizle" : "Şifreyi göster"}
              className="rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
            >
              {showPass ? (
                <EyeSlashIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          }
        />

        <div className="pt-1 text-right">
          <Link
            href="/sifremi-unuttum"
            className="text-[13px] font-medium text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline"
          >
            Şifremi unuttum
          </Link>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>
        )}

        <Button
          type="submit"
          loading={loading}
          className="w-full bg-neutral-950 text-white hover:bg-neutral-800 rounded-2xl py-3.5 text-base"
          size="lg"
        >
          Giriş Yap
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </form>

      {/* Bayi girişi — kompakt secondary CTA, kart hissi yok */}
      <div className="mt-8 flex items-center gap-3 text-xs text-neutral-400">
        <span className="h-px flex-1 bg-neutral-200" />
        <span className="uppercase tracking-widest">veya</span>
        <span className="h-px flex-1 bg-neutral-200" />
      </div>

      <Link
        href="/bayi-basvuru"
        className="mt-6 flex items-center justify-between rounded-2xl border border-neutral-200 px-5 py-4 transition-colors hover:border-neutral-900 hover:bg-neutral-50"
      >
        <div>
          <p className="text-sm font-semibold text-neutral-900">Bayi misiniz?</p>
          <p className="text-xs text-neutral-500">Bayi basvurusu yapin</p>
        </div>
        <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
      </Link>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
