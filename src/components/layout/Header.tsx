import Link from "next/link";
import Image from "next/image";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SearchCombobox } from "./search-combobox";
import { UserMenu } from "./user-menu";
import { HeaderActions } from "./header-actions";
import { CategoryMenu } from "./category-menu";
import { MobileDrawer } from "./mobile-drawer";
import { NavShell } from "./nav-shell";
import {
  SparklesIcon,
  FireIcon,
} from "@/components/ui/icons";

// React cache() per-request memoization — ayni request icinde Header
// birden fazla render edilirse (footer, layout etc.) tek DB query atilir.
// Production'da Cache Components ile saatlik cache eklenebilir.
const getNavData = cache(async () => {
  const [categories, publishers] = await Promise.all([
    prisma.category.findMany({
      where: { type: "ana" },
      select: { slug: true, name: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.publisher.findMany({
      select: { slug: true, name: true, _count: { select: { products: true } } },
      orderBy: { name: "asc" },
      take: 20,
    }),
  ]);
  return {
    categories: categories.map((c) => ({ ...c, count: c._count.products })),
    publishers: publishers.map((p) => ({ ...p, count: p._count.products })),
  };
});

export async function Header() {
  const [{ categories, publishers }, session] = await Promise.all([
    getNavData(),
    auth(),
  ]);

  return (
    <NavShell>
      {/* ─ Main bar ─ */}
      <header className="border-b border-neutral-100 bg-white/95">
        <div className="mx-auto flex h-24 max-w-7xl items-center gap-2 px-3 sm:gap-4 md:h-24 md:gap-6 md:px-6">
          <MobileDrawer
            categories={categories}
            publishers={publishers}
            user={session?.user ? {
              name: session.user.name ?? null,
              email: session.user.email ?? null,
              role: (session.user as { role?: string | null }).role ?? null,
            } : null}
          />

          {/* Brand — mobile: yatay logo (mark + wordmark), desktop: tam logo */}
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-1.5 transition-opacity hover:opacity-80"
            aria-label="Master Education ana sayfa"
          >
            {/* Mobile: mark + küçük wordmark — marka kimliği korunur */}
            <span className="flex md:hidden">
              <Image
                src="/me-logo-v2.png"
                alt="Master Education"
                width={224}
                height={80}
                priority
                className="h-20 w-auto object-contain"
              />
            </span>

            {/* Desktop: full logo görseli — wordmark görselin içinde, kesilme yok */}
            <span className="hidden md:block">
              <Image
                src="/me-logo-v2.png"
                alt="Master Education"
                width={336}
                height={120}
                priority
                className="h-16 w-auto object-contain lg:h-20"
              />
            </span>
          </Link>

          {/* Search — desktop ortalandı, mobile alt satıra */}
          <div className="hidden flex-1 md:block">
            <SearchCombobox />
          </div>

          {/* Right utilities — mobile yalnız sepet + kullanıcı, kalanlar drawer'da */}
          <div className="ml-auto flex items-center gap-1 md:gap-2">
            <UserMenu />
            <HeaderActions />
          </div>
        </div>

        {/* Mobile search row — kompakt 38px */}
        <div className="border-t border-neutral-100 px-3 py-2 md:hidden">
          <SearchCombobox />
        </div>

        {/* Category nav — pill-style. Tablet'te kompakt, lg'de tam set. */}
        <div className="hidden border-t border-neutral-100 bg-white md:block">
          <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-4 sm:px-6">
            <CategoryMenu categories={categories} publishers={publishers} />
            <span className="mx-2 h-5 w-px bg-neutral-200" />
            <NavPill href="/urunler?siralama=yeni" icon={<SparklesIcon className="h-3.5 w-3.5 text-amber-500" />}>
              Yeni Gelenler
            </NavPill>
            <NavPill href="/urunler?siralama=çok-satan" icon={<FireIcon className="h-3.5 w-3.5 text-rose-500" />}>
              Çok Satanlar
            </NavPill>
            {/* Publisher quick-links yalnız geniş ekranda */}
            <span className="hidden lg:contents">
              <NavPill href="/yayinevleri/collins">Collins</NavPill>
              <NavPill href="/yayinevleri/klett">Klett</NavPill>
              <NavPill href="/yayinevleri">Tüm Yayınevleri</NavPill>
            </span>
          </div>
        </div>
      </header>
    </NavShell>
  );
}

function NavPill({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-neutral-700 transition-all hover:bg-neutral-950 hover:text-white"
    >
      {icon && <span className="transition-transform group-hover:scale-110">{icon}</span>}
      {children}
    </Link>
  );
}
