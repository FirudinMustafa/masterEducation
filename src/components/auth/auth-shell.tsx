import Link from "next/link";
import Image from "next/image";
import { BRAND } from "@/lib/constants";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Apple-esque sade auth shell.
 * - Sol panel (≥lg): siyah arka plan, yumuşak altın gradient,
 *   minimal logo + bir cümle + bir alt-başlık + footer
 * - Sağ panel: bol whitespace, büyük başlık, içerik kart-içermez
 *   (kart hissi yok — Apple form sayfaları gibi düz layout)
 */
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="min-h-[100dvh] bg-white">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        {/* ── BRAND PANEL ─────────────────────────────────────── */}
        <aside className="relative hidden overflow-hidden bg-neutral-950 lg:flex lg:flex-col lg:justify-between lg:p-14">
          {/* Subtle gradient — soft, no banding, premium */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -left-40 h-[640px] w-[640px] rounded-full bg-gradient-to-br from-brand-gold/30 via-brand-gold/5 to-transparent blur-3xl" />
            <div className="absolute -bottom-32 right-0 h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-amber-400/15 to-transparent blur-3xl" />
          </div>
          {/* Noise grain — Apple-like depth */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' type='fractalNoise'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
            }}
          />

          {/* Top: logo — transparent versiyonu kullaniyoruz ki siyah panelde
              brightness-0 invert filter ile sadece mark+yazi beyaza cevrilsin,
              etrafi transparent kalsin. Aksi halde tüm kare beyaza donerdi. */}
          <Link href="/" className="relative z-10 inline-flex items-center">
            <Image
              src="/me-logo-v2-transparent.png"
              alt="Master Education"
              width={196}
              height={70}
              className="object-contain brightness-0 invert"
              priority
            />
          </Link>

          {/* Middle: hero copy — cesur, sade, tek vuruş */}
          <div className="relative z-10 max-w-md">
            <h2 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-white">
              Eğitimin{" "}
              <span className="bg-gradient-to-r from-brand-gold via-amber-200 to-brand-gold bg-clip-text text-transparent">
                tek adresi.
              </span>
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-neutral-400">
              Cambridge, Pearson, Collins, Klett ve 15+ yayınevinden 4.800 kitap.
              Bayi ve okul siparişleri icin özel iskontolar.
            </p>
          </div>

          {/* Bottom: minimal footer + minimal stat strip */}
          <div className="relative z-10 space-y-6">
            <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
              <Stat label="Ürün" value="4.800+" />
              <Stat label="Yayınevi" value="15+" />
              <Stat label="Bayi" value="200+" />
            </div>
            <p className="text-[11px] text-neutral-500">
              &copy; {new Date().getFullYear()} {BRAND.name}
            </p>
          </div>
        </aside>

        {/* ── FORM PANEL ──────────────────────────────────────── */}
        <main className="flex flex-col bg-white">
          {/* Mobile mini-header — sadece logo + giriş/kayit toggle yok */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4 lg:hidden">
            <Link href="/" className="inline-flex items-center">
              <Image
                src="/me-logo-v2.png"
                alt="Master Education"
                width={112}
                height={40}
                className="h-9 w-auto object-contain"
                priority
              />
            </Link>
            <Link
              href="/"
              className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
            >
              Magazaya don
            </Link>
          </div>

          <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-12 lg:px-16">
            <div className="w-full max-w-[420px]">
              {/* Header */}
              <div className="mb-10">
                <h1 className="font-display text-[34px] font-bold leading-tight tracking-tight text-neutral-950 sm:text-[40px]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Body */}
              {children}

              {/* Optional footer */}
              {footer && <div className="mt-8">{footer}</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        {label}
      </p>
    </div>
  );
}
