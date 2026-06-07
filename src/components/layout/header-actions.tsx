"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import { useWishlistStore } from "@/stores/wishlist-store";
import { useCompareStore } from "@/stores/compare-store";
import { HeartIcon, ScaleIcon, ShoppingCartIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface IconBtnProps {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  count: number;
  accent?: string;
  mounted: boolean;
}

function IconBtn({ href, label, Icon, count, accent, mounted }: IconBtnProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
    >
      <Icon className="h-5 w-5" />
      {mounted && count > 0 && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold",
            accent ?? "bg-brand-gold text-neutral-900"
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function HeaderActions() {
  const [mounted, setMounted] = useState(false);
  // Post-mount sinyali; SSR/client mismatch koruması için setState burada gerekli.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const cartCount = useCartStore((s) => s.getItemCount());
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const compareCount = useCompareStore((s) => s.items.length);

  // Mobilde yalnız sepet (drawer'da Favoriler/Karsilastir mevcut, çift gösterim
  // header'da gereksiz yer kaplıyordu). Desktop'ta uçü de görünür.
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <span className="hidden md:contents">
        <IconBtn
          href="/favoriler"
          label="Favoriler"
          Icon={HeartIcon}
          count={wishlistCount}
          accent="bg-rose-500 text-white"
          mounted={mounted}
        />
        <IconBtn
          href="/karsilastir"
          label="Karşılaştır"
          Icon={ScaleIcon}
          count={compareCount}
          accent="bg-sky-500 text-white"
          mounted={mounted}
        />
      </span>
      <IconBtn
        href="/sepet"
        label="Sepet"
        Icon={ShoppingCartIcon}
        count={cartCount}
        mounted={mounted}
      />
    </div>
  );
}
