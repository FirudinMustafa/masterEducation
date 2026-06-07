"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  UserIcon,
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  BuildingStorefrontIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { signOutWithCleanup } from "@/lib/client-signout";

export function UserMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (status === "loading") {
    return (
      <button className="flex h-10 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-sm text-neutral-400">
        <UserIcon className="h-4 w-4" />
      </button>
    );
  }

  if (!session?.user) {
    // Mobile: yalnız ikon (kullanıcı menu'ya tiklayinca giriş/kayit drawer'inda
    // erisilebilir + AuthShell sayfalari direkt link). Desktop: ikon + Kayıt pill.
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/giris"
          className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 md:inline-flex"
        >
          <UserIcon className="h-4 w-4" /> Bayi Girişi
        </Link>
        <Link
          href="/giris"
          aria-label="Bayi girişi"
          className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 md:hidden"
        >
          <UserIcon className="h-5 w-5" />
        </Link>
        <Link
          href="/bayi-basvuru"
          className="hidden items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-700 transition-colors md:inline-flex"
        >
          Bayi Başvuru
        </Link>
      </div>
    );
  }

  const role = session.user.role;
  const panelHref = role === "ADMIN" ? "/admin" : role === "DEALER" ? "/bayi" : null;
  const panelLabel =
    role === "ADMIN" ? "Yönetim Paneli" : role === "DEALER" ? "Bayi Paneli" : null;
  const PanelIcon = role === "ADMIN" ? ShieldCheckIcon : BuildingStorefrontIcon;
  const isPriv = role === "ADMIN" || role === "DEALER";

  // Yönetim Paneli pill yalniz ADMIN icin (DEALER icin tüm bayi UI elementleri
  // istek uzerine kaldirildi — bayi /bayi URL'sini dogrudan kullanir).
  const showAdminPill = role === "ADMIN" && panelHref && panelLabel;

  return (
    <div className="flex items-center gap-2">
      {showAdminPill && (
        <Link
          href={panelHref}
          className="hidden items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-rose-700 md:inline-flex"
        >
          <PanelIcon className="h-3.5 w-3.5" />
          {panelLabel}
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      )}

      <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border bg-white px-3 transition-colors cursor-pointer",
          isPriv
            ? "border-brand-gold/60 ring-1 ring-brand-gold-light"
            : "border-neutral-200 hover:border-neutral-300",
          open && "border-neutral-900"
        )}
      >
        <span className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
          role === "ADMIN" ? "bg-rose-100 text-rose-700" :
          role === "DEALER" ? "bg-emerald-100 text-emerald-700" :
          "bg-brand-gold-light text-neutral-900"
        )}>
          {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-neutral-800 sm:inline">
          {session.user.name ?? "Hesabım"}
        </span>
        <ChevronDownIcon className={cn("h-3.5 w-3.5 text-neutral-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl ring-1 ring-black/5">
          <div className="border-b border-neutral-100 p-4">
            <p className="text-sm font-semibold text-neutral-900">
              {session.user.name ?? "—"}
            </p>
            <p className="truncate text-xs text-neutral-500">{session.user.email}</p>
            <span
              className={cn(
                "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                role === "ADMIN" && "bg-rose-100 text-rose-700",
                role === "DEALER" && "bg-emerald-100 text-emerald-700",
                role === "CUSTOMER" && "bg-sky-100 text-sky-700"
              )}
            >
              {role === "ADMIN" ? "Yönetici" : role === "DEALER" ? "Bayi" : "Musteri"}
            </span>
          </div>
          <div className="p-2">
            {/* Panel linki — ADMIN ve DEALER icin dropdown icinde gösterilir.
                Storefront header'inda gözukmuyor (kullanıcı tarafindan kaldirildi),
                fakat profil dropdown'i bayinin kendi paneline donus yolu olmali. */}
            {panelHref && panelLabel && (
              <Link
                href={panelHref}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors",
                  role === "ADMIN"
                    ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                    : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                <PanelIcon className="h-4 w-4" />
                {panelLabel}
                <ArrowRightIcon className="ml-auto h-3.5 w-3.5" />
              </Link>
            )}
            <Link href="/hesabim" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
              Hesabım
            </Link>
            <Link href="/hesabim/siparislerim" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
              Siparişlerim
            </Link>
            <Link href="/hesabim/adresler" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
              Adreslerim
            </Link>
            <Link href="/favoriler" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">
              Favorilerim
            </Link>
          </div>
          <div className="border-t border-neutral-100 p-2">
            <button
              onClick={() => signOutWithCleanup("/")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              Çıkış Yap
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
