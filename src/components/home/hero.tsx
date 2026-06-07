import Link from "next/link";
import Image from "next/image";
import {
  ArrowRightIcon,
} from "@/components/ui/icons";

interface HeroProps {
  productCount: number;
  publisherCount: number;
  /** En az 1 görselli featured ürün gerekli */
  showcase: Array<{ id: string; name: string; slug: string; imageSrc: string | null; publisherName: string | null }>;
}

/**
 * B&O / Aceternity-Spotlight inspired hero.
 * - Generous whitespace, single bold headline (no clutter)
 * - Vertical issue label on the left (writing-mode rotated)
 * - Single hero product card with subtle 3D perspective + spotlight glow
 * - Logo mark watermark in corner
 * - Minimal mini-stats row at bottom
 */
export function Hero({ productCount, publisherCount, showcase }: HeroProps) {
  const featured = showcase[0];

  return (
    <section className="relative isolate overflow-hidden bg-white">
      {/* ─ Aceternity-style spotlight beams ─ */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[600px] w-[800px] rounded-full bg-gradient-to-br from-brand-gold-light/50 via-amber-50 to-transparent blur-3xl" />
        <div className="absolute -right-40 top-20 h-[500px] w-[700px] rounded-full bg-gradient-to-br from-rose-50 via-orange-50/60 to-transparent blur-3xl" />
        <div
          className="absolute inset-x-0 top-0 h-[800px] opacity-40"
          style={{
            background:
              "conic-gradient(from 230deg at 50% 0%, transparent 0deg, rgba(245, 184, 0, 0.06) 80deg, transparent 160deg)",
          }}
        />
      </div>

      {/* Subtle dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Vertical edge label (desktop) */}
      <div
        className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 text-[10px] font-bold uppercase tracking-[0.6em] text-neutral-300 lg:block"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateY(50%)" }}
      >
        Master Education · Volume 01 · 2026
      </div>

      {/* Logo mark watermark — bottom-right corner */}
      <div className="pointer-events-none absolute bottom-8 right-8 hidden opacity-[0.06] lg:block">
        <Image src="/me-mark.png" alt="" width={200} height={72} className="object-contain" priority />
      </div>

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-20 md:grid-cols-12 md:pb-28 md:pt-24 lg:gap-20 lg:pl-16 lg:pr-8 lg:pt-28 xl:pl-24">
        {/* ─ Left: editorial copy ─ */}
        <div className="md:col-span-7 animate-fade-up">
          {/* Volume / Issue label */}
          <div className="mb-8 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.3em] text-neutral-400">
            <span className="h-px w-10 bg-neutral-300" />
            <span>Volume 01 · Spring &apos;26</span>
          </div>

          {/* Single bold display headline — mobile-friendly sizes */}
          <h1 className="font-display text-[40px] font-black leading-[0.95] tracking-[-0.035em] text-neutral-950 sm:text-5xl md:text-6xl lg:text-7xl xl:text-[80px]">
            Eğitimin
            <br />
            <span
              className="font-display italic"
              style={{
                background:
                  "linear-gradient(115deg, #1F2937 0%, #DC2626 45%, #D4A000 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontWeight: 900,
                letterSpacing: "-0.045em",
              }}
            >
              tek adresi.
            </span>
          </h1>

          <p className="mt-7 max-w-md text-lg text-neutral-600 sm:text-xl">
            Cambridge, Pearson, Collins, Klett — dunyanin onde gelen yayınevleri,
            tek tikla.
          </p>

          {/* CTA row — single primary, single quiet */}
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Link
              href="/urunler"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-neutral-950 px-8 py-4 text-sm font-bold tracking-wide text-white transition-all hover:scale-[1.02]"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand-gold/40 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              <span className="relative">Tüm Ürünler</span>
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold text-neutral-950 transition-transform group-hover:rotate-45">
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </span>
            </Link>
            <Link
              href="/yayinevleri"
              className="group inline-flex items-center gap-1.5 text-sm font-bold text-neutral-700 transition-colors hover:text-neutral-950"
            >
              <span className="border-b-2 border-neutral-900 pb-0.5">Yayınevlerimiz</span>
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Mini stats — sade, minimal */}
          <div className="mt-16 flex items-end gap-10 border-t border-neutral-200 pt-7 md:gap-14">
            <MiniStat value={productCount.toLocaleString("tr-TR")} suffix="+" label="ürün" />
            <MiniStat value={publisherCount.toString()} suffix="" label="yayınevi" />
            <MiniStat value="10" suffix="+" label="yil" />
          </div>
        </div>

        {/* ─ Right: hero product card ─ */}
        <div className="relative md:col-span-5">
          {featured ? (
            <FeaturedProduct product={featured} />
          ) : (
            <div className="aspect-[3/4] rounded-3xl bg-gradient-to-br from-brand-gold-light via-amber-50 to-rose-50" />
          )}
        </div>
      </div>
    </section>
  );
}

function MiniStat({
  value,
  suffix,
  label,
}: {
  value: string;
  suffix: string;
  label: string;
}) {
  return (
    <div>
      <div className="font-display text-3xl font-black leading-none tracking-[-0.03em] text-neutral-950 sm:text-4xl md:text-5xl">
        {value}
        <span className="text-brand-gold-dark">{suffix}</span>
      </div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
        {label}
      </p>
    </div>
  );
}

function FeaturedProduct({
  product,
}: {
  product: { id: string; name: string; slug: string; imageSrc: string | null; publisherName: string | null };
}) {
  return (
    <Link
      href={`/urunler/${product.slug}`}
      className="group relative block aspect-[3/4] w-full max-w-md mx-auto"
      style={{ perspective: "1200px" }}
    >
      {/* Spotlight glow behind */}
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-brand-gold-light/60 via-amber-100 to-rose-100/50 blur-2xl transition-opacity duration-500 group-hover:opacity-90" />

      {/* Product card with 3D tilt */}
      <div
        className="relative h-full w-full overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl transition-transform duration-700 will-change-transform group-hover:scale-[1.02]"
        style={{ transform: "rotateY(-6deg) rotateX(3deg)", transformStyle: "preserve-3d" }}
      >
        {/* Featured badge */}
        <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-full bg-neutral-950/85 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-gold" />
          </span>
          Editor sectimi
        </div>

        {/* Image */}
        {product.imageSrc ? (
          <div className="relative h-full w-full bg-gradient-to-br from-neutral-50 to-neutral-100">
            <Image
              src={product.imageSrc}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-6xl font-black text-neutral-300">
            {product.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        {/* Bottom info overlay */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-6">
          {product.publisherName && (
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gold">
              {product.publisherName}
            </p>
          )}
          <p className="mt-1 line-clamp-2 font-display text-lg font-black leading-tight tracking-tight text-white sm:text-xl">
            {product.name}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-white/90 transition-all group-hover:text-brand-gold">
            Detayi Gor
            <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}
