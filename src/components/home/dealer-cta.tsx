import Link from "next/link";
import {
  ArrowRightIcon,
  StarIconSolid,
  BuildingStorefrontIcon,
  CreditCardIcon,
  TruckIcon,
} from "@/components/ui/icons";

/**
 * Modern dealer CTA section — bento-style with feature highlights
 */
export function DealerCTA() {
  return (
    <section className="relative isolate overflow-hidden py-16 sm:py-20">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950" />
      <div className="pointer-events-none absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-brand-gold/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-[500px] w-[500px] rounded-full bg-rose-500/10 blur-3xl" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 md:grid-cols-12 md:gap-12">
        {/* Copy */}
        <div className="md:col-span-7 text-white">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-gold/30 bg-brand-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-gold backdrop-blur">
            <StarIconSolid className="h-3.5 w-3.5" />
            Bayilere Özel
          </div>

          <h2 className="font-display text-3xl font-black leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            Bayi olun,{" "}
            <span className="bg-gradient-to-br from-brand-gold to-amber-400 bg-clip-text text-transparent">
              %35&apos;e varan
            </span>{" "}
            iskontoyu yakalayin.
          </h2>

          <p className="mt-5 max-w-xl text-base text-neutral-300 sm:text-lg">
            Eğitim kurumlari, kirtasiyeler ve toptan satis noktalari icin tasarlanmis
            B2B portal. 24 saat icinde basvurunuz incelenir.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/bayi-basvuru"
              className="group inline-flex items-center gap-2 rounded-2xl bg-brand-gold px-7 py-4 text-sm font-bold text-neutral-950 shadow-lg shadow-brand-gold/30 transition-all hover:scale-[1.02] hover:bg-brand-gold-dark"
            >
              Bayi Basvurusu Yap
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/iletisim"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/20 px-7 py-4 text-sm font-bold text-white transition-all hover:border-white/40 hover:bg-white/5"
            >
              Bilgi Al
            </Link>
          </div>
        </div>

        {/* Feature highlights bento */}
        <div className="md:col-span-5">
          <div className="grid gap-3">
            <FeatureRow
              Icon={CreditCardIcon}
              title="Acik Hesap Sistemi"
              desc="Onceden ödeme yapmadan sipariş verin"
              accent="from-emerald-500 to-emerald-600"
            />
            <FeatureRow
              Icon={BuildingStorefrontIcon}
              title="Toplu Sipariş"
              desc="Excel ile yuzlerce kalemi tek seferde isleyin"
              accent="from-violet-500 to-violet-600"
            />
            <FeatureRow
              Icon={TruckIcon}
              title="Okul & Kurum Tedariği"
              desc="Okullar ve kurumlar için toplu tedarik"
              accent="from-sky-500 to-sky-600"
            />
            <FeatureRow
              Icon={StarIconSolid}
              title="Dedike Destek"
              desc="Size özel temsilci ile direkt iletişim"
              accent="from-amber-500 to-rose-500"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureRow({
  Icon,
  title,
  desc,
  accent,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <div className="group flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur transition-all hover:border-white/20 hover:bg-white/10">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-lg`}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="font-bold text-white">{title}</p>
        <p className="text-sm text-neutral-400">{desc}</p>
      </div>
    </div>
  );
}
