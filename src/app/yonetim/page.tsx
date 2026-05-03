"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LockClosedIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";

export default function AdminLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If already admin, jump straight to the panel.
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [status, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result?.ok || result?.error) {
      setLoading(false);
      setError("Email veya sifre hatali.");
      return;
    }

    // Verify the authenticated user actually has ADMIN role.
    // We refetch the session since NextAuth may not immediately surface the new
    // token on the useSession hook.
    const r = await fetch("/api/auth/session");
    const s = await r.json().catch(() => null);
    setLoading(false);

    if (!s?.user || s.user.role !== "ADMIN") {
      await signOut({ redirect: false });
      setError("Bu alan yalnizca yoneticiler icindir.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 flex items-center justify-center p-4">
      {/* Base gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(245,184,0,0.12), transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(245,184,0,0.08), transparent 55%), linear-gradient(180deg, #0a0a0a 0%, #111111 100%)",
        }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 70%)",
        }}
      />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-brand-gold/20 blur-[120px]" />
        <div className="absolute bottom-[-10rem] left-[-6rem] h-[26rem] w-[26rem] rounded-full bg-amber-500/10 blur-[110px]" />
        <div className="absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-gold/5 blur-[90px]" />
      </div>

      {/* Diagonal shine line */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "linear-gradient(115deg, transparent 40%, rgba(245,184,0,0.06) 48%, transparent 56%)",
        }}
      />

      {/* Top & bottom edge fade to pure black for frame */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-3"
          title="Ana sayfaya don"
        >
          <Image
            src="/me-logo-v2.png"
            alt="Master Education"
            width={160}
            height={87}
            className="object-contain"
            priority
          />
        </Link>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-white/5">
          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-700">
              <LockClosedIcon className="h-3 w-3" />
              Yonetim Paneli
            </div>
            <h1 className="font-display text-2xl font-bold text-neutral-900">
              Yonetici Girisi
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Bu alan Master Education yoneticileri icindir.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="admin@ornek.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <div className="relative">
              <Input
                id="password"
                label="Sifre"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? "Sifreyi gizle" : "Sifreyi goster"}
                className="absolute right-3 top-9 text-neutral-400 hover:text-neutral-600 cursor-pointer"
              >
                {showPass ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Giris Yap
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2 rounded-lg border border-neutral-100 bg-neutral-50 p-3 text-[11px] text-neutral-500">
            <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>
              Tum giris denemeleri IP ve zamanla birlikte kayit altina alinir.
              Yetkisiz erisim girisimi suc teskil eder.
            </span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-neutral-500">
          Musteri misiniz?{" "}
          <Link
            href="/giris"
            className="font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline"
          >
            Musteri girisi
          </Link>
          {" · "}
          <Link
            href="/"
            className="font-medium text-neutral-300 underline-offset-2 hover:text-white hover:underline"
          >
            Ana sayfa
          </Link>
        </p>
      </div>
    </div>
  );
}
