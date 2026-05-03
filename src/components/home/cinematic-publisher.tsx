import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

interface Props {
  publishers: Array<{ slug: string; name: string; count: number }>;
}

/**
 * Cinematic full-bleed dark section featuring 1 hero publisher (most products)
 * + 4 secondary publisher tiles. Magazine-style "FEATURED PUBLISHER" feel.
 */
export function CinematicPublisher({ publishers }: Props) {
  if (publishers.length === 0) return null;

  const sorted = [...publishers].sort((a, b) => b.count - a.count);
  const [hero, ...rest] = sorted;
  const secondary = rest.slice(0, 4);

  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 py-20 text-white sm:py-24">
      {/* Background mesh */}
      <div className="pointer-events-none absolute -left-20 top-0 h-[500px] w-[500px] rounded-full bg-brand-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[400px] w-[600px] rounded-full bg-rose-500/10 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Vertical edge label */}
      <div
        className="pointer-events-none absolute left-3 top-1/2 hidden -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.5em] text-white/20 lg:block"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg) translateY(50%)" }}
      >
        Featured Publisher · Issue 03
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-12">
        {/* Heading */}
        <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.25em] text-brand-gold">
              <span className="font-display text-[18px] font-black italic leading-none">№</span>
              <span>03 / Yayinevleri</span>
            </div>
            <h2 className="font-display text-4xl font-black leading-[1.05] tracking-[-0.025em] sm:text-5xl md:text-6xl">
              Dunyanin{" "}
              <span
                className="font-display italic"
                style={{
                  background: "linear-gradient(120deg, #F5B800 0%, #FCD34D 50%, #DC2626 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontWeight: 900,
                }}
              >
                en saygin
              </span>{" "}
              <br className="hidden sm:block" />
              egitim markalari.
            </h2>
            <p className="mt-3 max-w-lg text-base text-neutral-400 sm:text-lg">
              Yetkili distributoru olarak; orjinal urun, dogrudan tedarik ve uygun fiyat garantisi.
            </p>
          </div>
          <Link
            href="/yayinevleri"
            className="group inline-flex items-center gap-2 rounded-full border-2 border-white/20 bg-white/5 px-5 py-2.5 text-sm font-bold backdrop-blur transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:bg-brand-gold hover:text-neutral-950"
          >
            Tum Yayinevleri
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-neutral-950 transition-transform group-hover:rotate-45">
              <ArrowRightIcon className="h-3 w-3" />
            </span>
          </Link>
        </div>

        {/* Hero featured + secondary grid */}
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
          {/* Hero publisher card — 2/3 width */}
          {hero && (
            <Link
              href={`/yayinevleri/${hero.slug}`}
              className="group relative col-span-1 overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 p-8 transition-all hover:scale-[1.01] md:col-span-2 md:p-12"
            >
              {/* Gold corner glow */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl transition-all group-hover:bg-brand-gold/30" />
              <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-rose-500/15 blur-3xl" />

              <div className="relative flex h-full flex-col justify-between gap-12 md:gap-16">
                <div className="flex items-start justify-between">
                  <div className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-brand-gold backdrop-blur">
                    En populer yayinevi
                  </div>
                  <div className="font-display text-6xl font-black italic leading-none text-white/5">
                    01
                  </div>
                </div>

                <div>
                  <p className="font-display text-6xl font-black leading-[0.9] tracking-[-0.03em] sm:text-7xl md:text-8xl lg:text-[120px]">
                    {hero.name}
                  </p>
                  <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6">
                    <div>
                      <p className="text-3xl font-black text-brand-gold sm:text-4xl">
                        {hero.count.toLocaleString("tr-TR")}
                      </p>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">
                        Urun
                      </p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold text-neutral-950 transition-transform group-hover:translate-x-2 group-hover:rotate-45">
                      <ArrowRightIcon className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Secondary 2x2 grid */}
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {secondary.map((p, idx) => (
              <Link
                key={p.slug}
                href={`/yayinevleri/${p.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-brand-gold/40 hover:bg-white/10"
              >
                <div className="font-display text-3xl font-black italic leading-none text-white/10">
                  0{idx + 2}
                </div>
                <div className="mt-3">
                  <p className="font-display text-lg font-black tracking-tight">{p.name}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-brand-gold">
                    {p.count.toLocaleString("tr-TR")} urun
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
