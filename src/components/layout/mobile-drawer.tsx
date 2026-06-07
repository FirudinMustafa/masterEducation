"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { signOutWithCleanup } from "@/lib/client-signout";
import {
  Bars3Icon,
  XMarkIcon,
  HeartIcon,
  ScaleIcon,
  ShoppingCartIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  ArrowRightIcon,
  SparklesIcon,
  FireIcon,
  ShieldCheckIcon,
  BuildingStorefrontIcon,
  TagIcon,
  BookOpenIcon,
} from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

interface DrawerSessionUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface Props {
  categories: { slug: string; name: string; count: number }[];
  publishers: { slug: string; name: string; count: number }[];
  user: DrawerSessionUser | null;
}

export function MobileDrawer({ categories, publishers, user }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const session = user ? { user } : null;
  const cartCount = useCartStore((s) => s.getItemCount());
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const compareCount = useCompareStore((s) => s.items.length);

  // Portal target — yalniz client'ta var, hydration mismatch icin guard.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const isDealer = role === "DEALER";

  // Portal HTML — body'ye render. Header'ın will-change-transform kapsayan
  // ataya gomulu fixed overlay'i 100vh viewport degil ata yuksekligi gibi
  // davraniyor. Portal bunu cozer.
  const drawerNode = open ? (
    <div
      className="fixed inset-0 z-[60] bg-black/40 h-[100dvh]"
      onClick={close}
    >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-0 flex h-[100dvh] w-[min(340px,88vw)] flex-col bg-white shadow-2xl"
          >
            {/* ─ Header: Logo + Close ───────────────────────────── */}
            <div className="flex items-center justify-between border-b border-neutral-100 p-4 shrink-0">
              <Logo size="sm" />
              <button
                onClick={close}
                aria-label="Kapat"
                className="rounded-full p-2 hover:bg-neutral-100 cursor-pointer"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* ─ Scrollable body ───────────────────────────────────
                pb-[env(safe-area-inset-bottom)+1rem]: iOS notch/home-indicator
                + alt browser chrome guvenligi. Footer (çıkış) yoksa son
                Section'in alt kismi clipped kalmasin diye 4rem ek tampon. */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}
            >
              {/* Identity / Auth */}
              {session?.user ? (
                <UserCard
                  name={session.user.name ?? null}
                  email={session.user.email ?? null}
                  role={role ?? null}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2 border-b border-neutral-100 p-4">
                  <Link
                    href="/giris"
                    onClick={close}
                    className="rounded-lg border border-neutral-300 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Bayi Girişi
                  </Link>
                  <Link
                    href="/bayi-basvuru"
                    onClick={close}
                    className="rounded-lg bg-neutral-900 py-2.5 text-center text-sm font-semibold text-white hover:bg-neutral-700"
                  >
                    Bayi Başvuru
                  </Link>
                </div>
              )}

              {/* ROLE PANEL CTA — Admin / Dealer için belirgin kısayol */}
              {isAdmin && (
                <div className="border-b border-neutral-100 p-3">
                  <Link
                    href="/admin"
                    onClick={close}
                    className="flex items-center gap-3 rounded-xl bg-rose-600 px-4 py-3 text-white shadow-sm hover:bg-rose-700"
                  >
                    <ShieldCheckIcon className="h-5 w-5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold uppercase tracking-wide">
                        Yönetim Paneli
                      </p>
                      <p className="text-[11px] opacity-90">
                        Sipariş, ürün, bayi yönetimi
                      </p>
                    </div>
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              )}
              {isDealer && (
                <div className="border-b border-neutral-100 p-3">
                  <Link
                    href="/bayi"
                    onClick={close}
                    className="flex items-center gap-3 rounded-xl bg-emerald-600 px-4 py-3 text-white shadow-sm hover:bg-emerald-700"
                  >
                    <BuildingStorefrontIcon className="h-5 w-5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold uppercase tracking-wide">
                        Bayi Paneli
                      </p>
                      <p className="text-[11px] opacity-90">
                        Siparişlerim, ekstre, iskontolar
                      </p>
                    </div>
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </div>
              )}

              {/* HIZLI ERIŞIM — Alışverişe başla + sepet/fav/kars */}
              <Section title="Hızlı Erisim">
                <PrimaryLink
                  href="/urunler"
                  onClick={close}
                  Icon={BookOpenIcon}
                  label="Tüm Ürünler"
                  hint="4.687 ürün"
                  variant="gold"
                />
                <Row
                  href="/sepet"
                  onClick={close}
                  Icon={ShoppingCartIcon}
                  label="Sepetim"
                  count={cartCount}
                  countTone="gold"
                />
                <Row
                  href="/favoriler"
                  onClick={close}
                  Icon={HeartIcon}
                  label="Favorilerim"
                  count={wishlistCount}
                  countTone="rose"
                />
                <Row
                  href="/karsilastir"
                  onClick={close}
                  Icon={ScaleIcon}
                  label="Karşılaştır"
                  count={compareCount}
                  countTone="sky"
                />
              </Section>

              {/* HESABIM — yalniz login olmuş kullanıcılar */}
              {session?.user && (
                <Section title="Hesabım">
                  <Row
                    href="/hesabim"
                    onClick={close}
                    Icon={UserIcon}
                    label="Profilim"
                  />
                  <Row
                    href="/hesabim/siparislerim"
                    onClick={close}
                    Icon={TagIcon}
                    label="Siparişlerim"
                  />
                  <Row
                    href="/hesabim/adresler"
                    onClick={close}
                    Icon={MapPinIcon}
                    label="Adreslerim"
                  />
                </Section>
              )}

              {/* KEŞFET */}
              <Section title="Kesfet">
                <Row
                  href="/urunler?siralama=yeni"
                  onClick={close}
                  Icon={SparklesIcon}
                  iconClass="text-amber-500"
                  label="Yeni Gelenler"
                />
                <Row
                  href="/urunler?siralama=çok-satan"
                  onClick={close}
                  Icon={FireIcon}
                  iconClass="text-rose-500"
                  label="Çok Satanlar"
                />
              </Section>

              {/* KATEGORİLER */}
              {categories.length > 0 && (
                <Section title="Kategoriler">
                  {categories.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/kategoriler/${c.slug}`}
                      onClick={close}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      <span>{c.name}</span>
                      <span className="text-xs text-neutral-400">{c.count}</span>
                    </Link>
                  ))}
                  <Link
                    href="/kategoriler"
                    onClick={close}
                    className="mt-1 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-900 hover:bg-neutral-50"
                  >
                    Tüm kategoriler
                    <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                </Section>
              )}

              {/* YAYINEVLERİ — yalnız ilk 8, "Tümü" link */}
              {publishers.length > 0 && (
                <Section title="Yayınevleri">
                  <div className="grid grid-cols-2 gap-1 px-1">
                    {publishers.slice(0, 8).map((p) => (
                      <Link
                        key={p.slug}
                        href={`/yayinevleri/${p.slug}`}
                        onClick={close}
                        className="rounded-md border border-neutral-100 px-2 py-2 text-center text-xs font-medium text-neutral-700 hover:bg-neutral-50 truncate"
                      >
                        {p.name}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/yayinevleri"
                    onClick={close}
                    className="mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-900 hover:bg-neutral-50"
                  >
                    Tüm yayınevleri
                    <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                </Section>
              )}

              {/* DESTEK */}
              <Section title="Destek">
                <Row
                  href="/siparis-takip"
                  onClick={close}
                  Icon={TruckIcon}
                  label="Sipariş Takip"
                />
                <Row href="/iletisim" onClick={close} Icon={EnvelopeIcon} label="İletişim" />
                <Row href="/sss" onClick={close} Icon={QuestionMarkIcon} label="Sıkça Sorulan" />
                {!session?.user && (
                  <Row
                    href="/bayi-basvuru"
                    onClick={close}
                    Icon={BuildingStorefrontIcon}
                    label="Bayi Basvurusu"
                    iconClass="text-emerald-600"
                  />
                )}
              </Section>
            </div>

            {/* ─ Footer: Logout (sticky bottom) ──────────────────── */}
            {session?.user && (
              <div
                className="shrink-0 border-t border-neutral-100 p-3"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
              >
                <button
                  onClick={() => {
                    close();
                    signOutWithCleanup("/");
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Çıkış Yap
                </button>
              </div>
            )}
          </aside>
        </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 md:hidden cursor-pointer"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>
      {mounted && drawerNode ? createPortal(drawerNode, document.body) : null}
    </>
  );
}

// ───────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────

function UserCard({
  name,
  email,
  role,
}: {
  name: string | null;
  email: string | null;
  role: string | null;
}) {
  const initial = (name ?? email ?? "?").charAt(0).toUpperCase();
  const roleBadge =
    role === "ADMIN"
      ? { label: "Yönetici", cls: "bg-rose-100 text-rose-700" }
      : role === "DEALER"
        ? { label: "Bayi", cls: "bg-emerald-100 text-emerald-700" }
        : { label: "Musteri", cls: "bg-sky-100 text-sky-700" };

  return (
    <div className="border-b border-neutral-100 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gold-light text-base font-bold text-neutral-900">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {name ?? "—"}
          </p>
          <p className="truncate text-[11px] text-neutral-500">{email}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
            roleBadge.cls
          )}
        >
          {roleBadge.label}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-100 p-2">
      <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({
  href,
  onClick,
  Icon,
  label,
  iconClass,
  count,
  countTone,
}: {
  href: string;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass?: string;
  count?: number;
  countTone?: "gold" | "rose" | "sky";
}) {
  const toneCls =
    countTone === "rose"
      ? "bg-rose-500 text-white"
      : countTone === "sky"
        ? "bg-sky-500 text-white"
        : "bg-brand-gold text-neutral-900";
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
    >
      <Icon className={cn("h-4.5 w-4.5 text-neutral-400", iconClass)} />
      <span className="flex-1">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
            toneCls
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function PrimaryLink({
  href,
  onClick,
  Icon,
  label,
  hint,
  variant,
}: {
  href: string;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  variant?: "gold";
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-3 transition-colors",
        variant === "gold"
          ? "bg-brand-gold-light/40 hover:bg-brand-gold-light/70"
          : "hover:bg-neutral-50"
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
        <Icon className="h-5 w-5 text-brand-gold-dark" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">{label}</p>
        {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
      </div>
      <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
    </Link>
  );
}

// Inline icon helpers — drawer'a özgü, ayrı dosya açmaya değmez
function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
      />
    </svg>
  );
}
function TruckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0H15m-9.75 0H3.375c-.621 0-1.125-.504-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.07-1.123-.045-.471-.082-.875-.139-1.337L18.75 14.25v-2.625A.75.75 0 0 0 18 10.875h-3M2.25 5.25h12.375M2.25 5.25c-.621 0-1.125.504-1.125 1.125V12m1.125-6.75h12.375"
      />
    </svg>
  );
}
function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}
function QuestionMarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
      />
    </svg>
  );
}
