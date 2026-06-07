import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon } from "@/components/ui/icons";

interface Props {
  /** En az 1 görselli ürün; ideal 3 — bir hero + iki yan */
  products: Array<{
    id: string;
    name: string;
    slug: string;
    imageSrc: string | null;
    publisherName: string | null;
    price: number;
  }>;
  eyebrow: string;
  title: string;
  italicWord?: string;
}

/**
 * B&O cinematic dark feature with Aceternity-style spotlight beam.
 * Asymmetric layout: 1 huge hero on left + 2 stacked smaller on right.
 */
export function SpotlightFeature({ products, eyebrow, title, italicWord }: Props) {
  if (products.length === 0) return null;
  const [hero, second, third] = products;

  // Title parça parça (italic için)
  let titleParts: { text: string; italic: boolean }[] = [{ text: title, italic: false }];
  if (italicWord && title.includes(italicWord)) {
    const idx = title.indexOf(italicWord);
    titleParts = [
      { text: title.slice(0, idx), italic: false },
      { text: italicWord, italic: true },
      { text: title.slice(idx + italicWord.length), italic: false },
    ].filter((p) => p.text.length > 0);
  }

  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 py-24 text-white sm:py-32">
      {/* ─ Aceternity-style spotlight beam ─ */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 50% 30% at 30% 20%, rgba(245, 184, 0, 0.15), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(220, 38, 38, 0.1), transparent 70%)",
        }}
      />

      {/* Diagonal beam line */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(245, 184, 0, 0.04) 48%, transparent 60%)",
        }}
      />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        {/* Eyebrow + Title */}
        <div className="mb-12 max-w-3xl sm:mb-16">
          <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.3em] text-brand-gold">
            <span className="h-px w-10 bg-brand-gold/40" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="font-display text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-5xl md:text-6xl lg:text-7xl">
            {titleParts.map((p, i) =>
              p.italic ? (
                <span
                  key={i}
                  className="font-display italic"
                  style={{
                    background:
                      "linear-gradient(115deg, #F5B800 0%, #FCD34D 50%, #DC2626 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    fontWeight: 900,
                  }}
                >
                  {p.text}
                </span>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )}
          </h2>
        </div>

        {/* Asymmetric grid: 7/12 hero + 5/12 stacked */}
        <div className="grid gap-4 md:grid-cols-12 md:gap-6">
          {/* Hero card — full bleed image */}
          {hero && (
            <Link
              href={`/urunler/${hero.slug}`}
              className="group relative col-span-1 overflow-hidden rounded-3xl bg-neutral-900 md:col-span-7"
            >
              <div className="relative aspect-[4/5] sm:aspect-[16/10] md:aspect-auto md:h-full md:min-h-[600px]">
                {hero.imageSrc ? (
                  <Image
                    src={hero.imageSrc}
                    alt={hero.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 60vw"
                    className="object-cover transition-transform duration-1000 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-neutral-800 text-7xl font-black text-neutral-700">
                    {hero.name.slice(0, 2).toUpperCase()}
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

                {/* Caption */}
                <div className="absolute inset-x-0 bottom-0 p-8 sm:p-10 md:p-12">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-brand-gold px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-950">
                      Featured
                    </span>
                    {hero.publisherName && (
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                        {hero.publisherName}
                      </span>
                    )}
                  </div>
                  <p className="font-display text-2xl font-black leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-5xl">
                    {hero.name}
                  </p>
                  <div className="mt-5 flex items-center justify-end border-t border-white/10 pt-5">
                    <span className="flex items-center gap-2 text-sm font-bold transition-all group-hover:gap-3 group-hover:text-brand-gold">
                      Detay
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold text-neutral-950 transition-transform group-hover:rotate-45">
                        <ArrowRightIcon className="h-4 w-4" />
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Right column: 2 stacked smaller */}
          <div className="grid gap-4 md:col-span-5 md:gap-6">
            {[second, third].filter(Boolean).map((p) => (
              <Link
                key={p.id}
                href={`/urunler/${p.slug}`}
                className="group relative overflow-hidden rounded-3xl bg-neutral-900"
              >
                <div className="relative aspect-[16/10] sm:aspect-[4/3] md:h-full md:min-h-[290px]">
                  {p.imageSrc ? (
                    <Image
                      src={p.imageSrc}
                      alt={p.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 40vw"
                      className="object-cover transition-transform duration-1000 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-neutral-800 text-5xl font-black text-neutral-700">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                    {p.publisherName && (
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                        {p.publisherName}
                      </p>
                    )}
                    <p className="mt-1 line-clamp-2 font-display text-lg font-black leading-tight tracking-tight">
                      {p.name}
                    </p>
                    <div className="mt-2.5 flex items-center justify-end">
                      <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:text-brand-gold" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
