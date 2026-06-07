import Link from "next/link";

interface Props {
  publishers: Array<{ slug: string; name: string; count: number }>;
}

/**
 * Infinite-scrolling publisher strip — CSS-only marquee.
 * Pauses on hover so users can read brand names.
 */
export function PublisherMarquee({ publishers }: Props) {
  if (publishers.length === 0) return null;
  // Duplicate the list so the loop is seamless.
  const items = [...publishers, ...publishers];

  return (
    <section className="relative border-y border-neutral-200/70 bg-gradient-to-r from-neutral-50 via-white to-neutral-50 py-8">
      <div className="mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Calistigimiz Yayınevleri
        </p>
      </div>
      <div className="relative overflow-hidden">
        {/* Edge fade masks */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-white to-transparent" />

        <div className="flex animate-marquee gap-3 will-change-transform">
          {items.map((p, i) => (
            <Link
              key={`${p.slug}-${i}`}
              href={`/yayinevleri/${p.slug}`}
              className="group flex shrink-0 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-3 transition-all hover:-translate-y-0.5 hover:border-brand-gold hover:shadow-md"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-neutral-900 to-neutral-700 text-xs font-black text-brand-gold">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="whitespace-nowrap font-bold tracking-tight text-neutral-900">
                {p.name}
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 group-hover:bg-brand-gold-light">
                {p.count.toLocaleString("tr-TR")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
