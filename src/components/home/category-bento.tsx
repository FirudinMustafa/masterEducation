import Link from "next/link";
import { CATEGORY_ICONS } from "@/components/layout/category-menu";
import { ArrowRightIcon, BookOpenIcon } from "@/components/ui/icons";
import { SectionHeading } from "./section-heading";

interface Props {
  categories: Array<{ slug: string; name: string; count: number }>;
}

/**
 * Bento-style category grid:
 * - 1 large hero tile (most popular category by count)
 * - 1 medium tile
 * - 4 small tiles
 * Falls back gracefully if fewer categories exist.
 */
export function CategoryBento({ categories }: Props) {
  if (categories.length === 0) return null;

  const sorted = [...categories].sort((a, b) => b.count - a.count);
  const [hero, second, ...rest] = sorted;
  const smalls = rest.slice(0, 4);

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
      <SectionHeading
        eyebrow="Kategoriler"
        title="Dilinize gore kesfedin"
        subtitle="Seviyenize ve hedefinize uygun materyaller"
        link={{ href: "/urunler", label: "Tum Urunler" }}
      />

      {/* Bento grid — desktop: 4 cols x 3 rows, mobile: stacked */}
      <div className="grid auto-rows-[140px] grid-cols-2 gap-3 sm:auto-rows-[160px] sm:gap-4 md:grid-cols-4 md:auto-rows-[180px]">
        {/* Hero tile: 2x2 */}
        {hero && <BentoTile cat={hero} variant="hero" className="col-span-2 row-span-2" />}

        {/* Medium tile: 2x1 */}
        {second && <BentoTile cat={second} variant="medium" className="col-span-2 row-span-1" />}

        {/* Smalls: 1x1 each */}
        {smalls.map((cat) => (
          <BentoTile key={cat.slug} cat={cat} variant="small" />
        ))}
      </div>
    </section>
  );
}

function BentoTile({
  cat,
  variant,
  className = "",
}: {
  cat: { slug: string; name: string; count: number };
  variant: "hero" | "medium" | "small";
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[cat.slug] ?? BookOpenIcon;

  const variantClasses = {
    hero: "from-neutral-950 via-neutral-900 to-neutral-800 text-white",
    medium: "from-brand-gold-light via-amber-100 to-rose-50 text-neutral-950",
    small: "from-white to-neutral-50 text-neutral-950 border border-neutral-200",
  };

  return (
    <Link
      href={`/kategoriler/${cat.slug}`}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${variantClasses[variant]} transition-all hover:-translate-y-0.5 hover:shadow-xl ${className}`}
    >
      {/* Decorative blob */}
      {variant === "hero" && (
        <>
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />
        </>
      )}
      {variant === "medium" && (
        <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-brand-gold/30 blur-2xl" />
      )}

      <div
        className={`relative flex h-full flex-col justify-between p-4 sm:p-5 ${
          variant === "hero" ? "md:p-7" : ""
        }`}
      >
        <div className="flex items-start justify-between">
          <div
            className={`flex items-center justify-center rounded-xl ${
              variant === "hero"
                ? "h-14 w-14 bg-brand-gold text-neutral-950"
                : variant === "medium"
                  ? "h-11 w-11 bg-neutral-950 text-brand-gold"
                  : "h-10 w-10 bg-brand-gold-light text-neutral-900 group-hover:bg-brand-gold"
            } transition-colors`}
          >
            <Icon className={variant === "hero" ? "h-7 w-7" : "h-5 w-5"} />
          </div>
          {variant === "hero" && (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-gold backdrop-blur">
              En populer
            </span>
          )}
        </div>

        <div>
          <p
            className={`font-display font-black tracking-tight ${
              variant === "hero"
                ? "text-2xl sm:text-3xl md:text-4xl"
                : variant === "medium"
                  ? "text-xl sm:text-2xl"
                  : "text-base sm:text-lg"
            }`}
          >
            {cat.name}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p
              className={`font-semibold ${
                variant === "hero" ? "text-sm text-neutral-300" : "text-xs text-neutral-600"
              }`}
            >
              {cat.count.toLocaleString("tr-TR")} urun
            </p>
            <ArrowRightIcon
              className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${
                variant === "hero" ? "text-brand-gold" : "text-neutral-500"
              }`}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
