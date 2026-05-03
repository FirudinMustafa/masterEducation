import {
  BookOpenIcon,
  BuildingStorefrontIcon,
  AcademicCapIcon,
  TruckIcon,
} from "@/components/ui/icons";

interface Props {
  productCount: number;
  publisherCount: number;
}

/**
 * Big-number stats strip — establishes scale & credibility.
 * Server-rendered (no animated counters yet) but visually impactful.
 */
export function StatsStrip({ productCount, publisherCount }: Props) {
  const stats = [
    {
      Icon: BookOpenIcon,
      value: productCount.toLocaleString("tr-TR"),
      suffix: "+",
      label: "Egitim materyali",
      gradient: "from-brand-gold-dark to-amber-500",
    },
    {
      Icon: BuildingStorefrontIcon,
      value: publisherCount.toString(),
      suffix: "+",
      label: "Yayinevi",
      gradient: "from-rose-500 to-pink-500",
    },
    {
      Icon: AcademicCapIcon,
      value: "10",
      suffix: "+",
      label: "Yil tecrube",
      gradient: "from-violet-500 to-fuchsia-500",
    },
    {
      Icon: TruckIcon,
      value: "1-3",
      suffix: " gun",
      label: "Hizli kargo",
      gradient: "from-sky-500 to-cyan-500",
    },
  ];

  return (
    <section className="relative isolate overflow-hidden bg-neutral-950 py-14 text-white sm:py-16">
      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -left-20 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-brand-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-rose-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <div
                className={`mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${s.gradient}`}
              >
                <s.Icon className="h-6 w-6 text-white" />
              </div>
              <div className="font-display text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                {s.value}
                <span className="text-brand-gold">{s.suffix}</span>
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-neutral-400 sm:text-sm">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
