import {
  AcademicCapIcon,
  TruckIcon,
  ShieldCheckIcon,
  CreditCardIcon,
} from "@/components/ui/icons";

/**
 * Modern trust/value-prop strip with hover lift cards.
 */
export function TrustFeatures() {
  const items = [
    {
      Icon: AcademicCapIcon,
      title: "Orjinal Materyaller",
      desc: "Yetkili distributoru olarak; her ürün orjinaldir.",
      accent: "bg-emerald-50 text-emerald-600",
    },
    {
      Icon: TruckIcon,
      title: "Hızlı Kargo",
      desc: "1-3 is günu icinde Turkiye'nin her yerine.",
      accent: "bg-sky-50 text-sky-600",
    },
    {
      Icon: ShieldCheckIcon,
      title: "Guvenli Ödeme",
      desc: "3D Secure ile tüm kart islemleriniz korunur.",
      accent: "bg-violet-50 text-violet-600",
    },
    {
      Icon: CreditCardIcon,
      title: "Kolay İade",
      desc: "14 gün icinde kosulsuz iade hakki.",
      accent: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.title}
            className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-brand-gold/30 hover:shadow-lg"
          >
            {/* Hover gradient bg */}
            <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-gold-light/0 blur-2xl transition-all duration-500 group-hover:bg-brand-gold-light/40" />
            <div className="relative">
              <div
                className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl ${it.accent} transition-transform group-hover:scale-110`}
              >
                <it.Icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-bold text-neutral-950">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{it.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
