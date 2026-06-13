"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { signOutWithCleanup } from "@/lib/client-signout";
import { cn } from "@/lib/utils";
import { ArrowRightOnRectangleIcon, XMarkIcon } from "@/components/ui/icons";

// Cari hesap modu disinda anlamsiz olan menu yollari (PREPAID bayilere
// gösterilmez — sidebar bunlari filtreler).
const OPEN_ACCOUNT_ONLY = new Set(["/bayi/toplu-siparis"]);

const NAV_ITEMS = [
  {
    href: "/bayi",
    label: "Dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
  {
    href: "/bayi/siparisler",
    label: "Siparişlerim",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
  },
  {
    href: "/bayi/iade",
    label: "İadelerim",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
      </svg>
    ),
  },
  {
    href: "/bayi/belgeler",
    label: "Belgelerim",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    href: "/bayi/faturalar",
    label: "Faturalarım",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
      </svg>
    ),
  },
  {
    href: "/bayi/toplu-siparis",
    label: "Toplu Sipariş",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0 0C6 11.496 5.496 12 4.875 12M18 18.375v-1.5c0-.621-.504-1.125-1.125-1.125m1.125 2.625c0-.621.504-1.125 1.125-1.125M18 18.375c0 .621.504 1.125 1.125 1.125m-13.5 0h1.5m-1.5 0C5.496 19.5 6 18.996 6 18.375m0 0v-1.5c0-.621-.504-1.125-1.125-1.125M6 18.375c0 .621-.504 1.125-1.125 1.125" />
      </svg>
    ),
  },
  // "Ürünler" linki kaldirildi — sidebar altindaki "Magazaya Git" ile ayni
  // isi yapiyordu, navigasyon kalabaligini azaltiyoruz.
];

interface DealerSidebarProps {
  paymentTerms?: "OPEN_ACCOUNT" | "PREPAID";
  companyName?: string;
}

/**
 * Inner nav body — desktop sidebar ve mobile drawer ortak içerik. `onNavigate`
 * callback'i drawer'da link tiklaninca otomatik kapanma için.
 */
function DealerNavBody({
  paymentTerms,
  companyName,
  onNavigate,
}: DealerSidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isPrepaid = (paymentTerms ?? session?.user?.dealerPaymentTerms) === "PREPAID";

  const navItems = NAV_ITEMS.filter(
    (item) => !(isPrepaid && OPEN_ACCOUNT_ONLY.has(item.href))
  );

  return (
    <div className="p-4 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 px-3 py-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-brand-black">{companyName || "Bayi Paneli"}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
            {paymentTerms === "PREPAID" ? "Pesin Ödeme" : "Acik Hesap"}
          </p>
        </div>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/bayi" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-brand-black"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 pt-4 border-t border-gray-100 space-y-1">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-brand-black transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          Magazaya Git
        </Link>
        <button
          onClick={() => signOutWithCleanup("/")}
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          Çıkış Yap
        </button>
      </div>
    </div>
  );
}

export function DealerSidebar(props: DealerSidebarProps = {}) {
  return (
    <aside className="w-60 bg-white border-r border-gray-200 shrink-0 hidden md:flex md:flex-col">
      <DealerNavBody {...props} />
    </aside>
  );
}

export function DealerMobileDrawer({
  open,
  onClose,
  ...props
}: DealerSidebarProps & { open: boolean; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 md:hidden" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 top-0 flex h-full w-[min(280px,82vw)] flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <span className="text-sm font-bold text-brand-black">Bayi Menu</span>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-full p-2 hover:bg-gray-100 cursor-pointer"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <DealerNavBody {...props} onNavigate={onClose} />
      </aside>
    </div>
  );
}

/**
 * Mobile header — drawer trigger + bayi label + magazaya git linki. Bayi
 * layout'unda children üstüne yerlestirilir.
 */
export function DealerMobileHeader(props: DealerSidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setOpen(true)}
            aria-label="Menuyu ac"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <Link href="/bayi" className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349M3.75 21V9.349" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-brand-black truncate">
              {props.companyName || "Bayi"}
            </span>
          </Link>
        </div>
        <Link
          href="/"
          className="text-xs font-medium text-gray-600 hover:text-brand-black px-2 py-1 rounded-md hover:bg-gray-50 shrink-0"
        >
          Magazaya
        </Link>
      </div>
      <DealerMobileDrawer open={open} onClose={() => setOpen(false)} {...props} />
    </>
  );
}
