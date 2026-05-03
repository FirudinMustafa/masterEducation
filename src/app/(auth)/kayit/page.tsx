"use client";

import { useMemo, useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { safeCallbackUrl } from "@/lib/safe-callback";
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";

function getStrength(pwd: string): { level: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Za-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd) || /[A-Z]/.test(pwd)) score++;
  const level = score as 0 | 1 | 2 | 3 | 4;
  const label = ["", "Cok zayif", "Zayif", "Iyi", "Guclu"][level];
  return { level, label };
}

function RegisterPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const callbackUrl = safeCallbackUrl(sp.get("callbackUrl"));
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  // Honeypot — kullanici asla gormez/dokunmaz; bot'lar dolduracak.
  const [website, setWebsite] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getStrength(form.password), [form.password]);
  const strengthBar = ["bg-neutral-200", "bg-rose-500", "bg-amber-400", "bg-amber-300", "bg-emerald-500"][
    strength.level
  ];

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const passwordsMatch =
    !form.passwordConfirm || form.password === form.passwordConfirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.passwordConfirm) {
      setError("Sifreler eslesmiyor.");
      return;
    }
    if (strength.level < 3) {
      setError("Sifreniz yeterince guclu degil (en az 3 kriter).");
      return;
    }
    if (!termsAccepted) {
      setError(
        "Devam etmek icin Uyelik Sozlesmesi ve KVKK Aydinlatma Metni'ni onaylamaniz gerekir."
      );
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        termsAccepted,
        marketingConsent,
        website,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setLoading(false);
      if (res.status === 409) {
        setError("Bu email zaten kayitli. Giris yapmayi deneyin.");
      } else {
        setError(data.error ?? "Kayit sirasinda bir hata olustu.");
      }
      return;
    }

    const signInResult = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setLoading(false);
    if (signInResult?.error) {
      const qs = new URLSearchParams({ kayit: "basarili" });
      if (callbackUrl !== "/") qs.set("callbackUrl", callbackUrl);
      router.push(`/giris?${qs.toString()}`);
      return;
    }
    toast.success("Hosgeldiniz!", "Hesabiniz olusturuldu ve giris yaptiniz.");
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthShell
      title="Hesap olustur"
      subtitle="Sadece birkac bilgi — favorilerinizi kaydedin, siparislerinizi takip edin."
      footer={
        <p className="text-center text-sm text-neutral-500">
          Zaten hesabiniz var mi?{" "}
          <Link
            href={
              callbackUrl !== "/"
                ? `/giris?callbackUrl=${encodeURIComponent(callbackUrl)}`
                : "/giris"
            }
            className="font-semibold text-neutral-900 underline-offset-4 hover:underline"
          >
            Giris yap
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Honeypot — bot trap. CSS ve aria-hidden ile insan kullaniciya
            asla gosterilmez; ekran okuyucu da gormez. Bot'lar bu input'u
            doldurursa backend reddeder. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <FloatingInput
          id="name"
          label="Ad Soyad"
          autoComplete="name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
        <FloatingInput
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />
        <FloatingInput
          id="phone"
          label="Telefon (opsiyonel)"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
        />

        <FloatingInput
          id="password"
          label="Sifre"
          type={showPass ? "text" : "password"}
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          required
          helper={
            form.password
              ? `Guvenlik: ${strength.label}`
              : "En az 8 karakter, harf + rakam"
          }
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Sifreyi gizle" : "Sifreyi goster"}
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

        {/* Password strength bar — Apple tarzı kompakt segmented */}
        {form.password && (
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-full transition-colors",
                  i <= strength.level ? strengthBar : "bg-neutral-100"
                )}
              />
            ))}
          </div>
        )}

        <FloatingInput
          id="passwordConfirm"
          label="Sifre tekrar"
          type="password"
          autoComplete="new-password"
          value={form.passwordConfirm}
          onChange={(e) => update("passwordConfirm", e.target.value)}
          required
          error={!passwordsMatch ? "Sifreler eslesmiyor." : undefined}
        />

        {/* Acik riza checkbox'lari — KVKK + sozlesme zorunlu, pazarlama opsiyonel */}
        <div className="space-y-2.5 pt-1">
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
                Uyelik Sozlesmesi
              </Link>
              &apos;ni ve{" "}
              <Link
                href="/kvkk"
                target="_blank"
                className="font-medium underline underline-offset-2 hover:text-neutral-900"
              >
                KVKK Aydinlatma Metni
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
          <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</p>
        )}

        <Button
          type="submit"
          loading={loading}
          disabled={!termsAccepted}
          className="w-full bg-neutral-950 text-white hover:bg-neutral-800 rounded-2xl py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          size="lg"
        >
          Hesap Olustur
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </form>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}
