"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLoginGate } from "@/stores/login-gate-store";
import { safeCallbackUrl } from "@/lib/safe-callback";
import {
  XMarkIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";

export function LoginGate() {
  const open = useLoginGate((s) => s.open);
  const reason = useLoginGate((s) => s.reason);
  const hide = useLoginGate((s) => s.hide);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, hide]);

  if (!open || !reason) return null;

  const rawCallback =
    reason.callbackUrl ??
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/");
  // Open-redirect koruması — same-origin relative path zorunlu
  const callback = safeCallbackUrl(rawCallback);

  const loginHref = `/giris?callbackUrl=${encodeURIComponent(callback)}`;
  const registerHref = "/bayi-basvuru";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-neutral-800/40 p-4 backdrop-blur-sm"
      onClick={hide}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-brand-gold via-amber-400 to-brand-gold" />

        <button
          onClick={hide}
          aria-label="Kapat"
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 cursor-pointer"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {/* Body */}
        <div className="relative px-8 pb-7 pt-9 text-center">
          {/* Soft gold halo behind logo */}
          <div
            className="pointer-events-none absolute left-1/2 top-8 h-28 w-28 -translate-x-1/2 rounded-full opacity-60 blur-2xl"
            style={{ background: "radial-gradient(circle, #FDE68A, transparent 70%)" }}
          />

          <div className="relative mb-4 flex justify-center">
            <div className="flex h-20 items-center justify-center rounded-2xl bg-brand-gold-light/50 px-4 ring-4 ring-white">
              <Image
                src="/me-logo-v2.png"
                alt="Master Education"
                width={182}
                height={65}
                priority
                className="object-contain"
              />
            </div>
          </div>

          <h2 className="font-display text-xl font-bold text-neutral-800 sm:text-2xl">
            {reason.title}
          </h2>
          {reason.description && (
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-neutral-500">
              {reason.description}
            </p>
          )}

          <div className="mt-6 grid gap-2.5">
            <Link
              href={registerHref}
              onClick={hide}
              className="group flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-5 py-3.5 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/30"
            >
              Bayi Başvurusu Yap
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={loginHref}
              onClick={hide}
              className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              Bayiyseniz giriş yapın
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
