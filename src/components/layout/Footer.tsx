import Link from "next/link";
import { BRAND } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";
import { ReopenCookieConsent } from "@/components/legal/cookie-consent";
import {
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TruckIcon,
  CreditCardIcon,
  BuildingStorefrontIcon,
} from "@/components/ui/icons";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-white">
      {/* Trust strip */}
      <div className="border-b border-neutral-100 bg-neutral-50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:gap-5 sm:px-6 sm:py-8 md:grid-cols-4 md:gap-6">
          <TrustItem
            Icon={TruckIcon}
            title="Hizli Kargo"
            desc="Turkiye geneli teslimat"
            accent="bg-emerald-100 text-emerald-700"
          />
          <TrustItem
            Icon={ShieldCheckIcon}
            title="Guvenli Odeme"
            desc="256-bit SSL sifreleme"
            accent="bg-sky-100 text-sky-700"
          />
          <TrustItem
            Icon={CreditCardIcon}
            title="Kolay Iade"
            desc="14 gun iade hakki"
            accent="bg-violet-100 text-violet-700"
          />
          <TrustItem
            Icon={BuildingStorefrontIcon}
            title="Orjinal Urun"
            desc="Yetkili distributor garantisi"
            accent="bg-amber-100 text-amber-700"
          />
        </div>
      </div>

      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 md:py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8 lg:grid-cols-5 lg:gap-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Logo size="md" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-600">
              ELT, DaF, MEB ve dunyanin onde gelen yayinevlerinin egitim materyalleri.
              Bireysel ve toptan satis, bayi agi ve 4898+ urun.
            </p>
            <div className="mt-5 space-y-2.5 text-sm text-neutral-600">
              <a href={`tel:${BRAND.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-neutral-900">
                <PhoneIcon className="h-4 w-4 text-brand-gold-dark" />
                {BRAND.phone}
              </a>
              <a href={`mailto:${BRAND.email}`} className="flex items-center gap-2 hover:text-neutral-900">
                <EnvelopeIcon className="h-4 w-4 text-brand-gold-dark" />
                {BRAND.email}
              </a>
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-4 w-4 text-brand-gold-dark" />
                {BRAND.address}
              </div>
            </div>
          </div>

          <FooterCol
            title="Alisveris"
            links={[
              { label: "Tum Urunler", href: "/urunler" },
              { label: "Yeni Gelenler", href: "/urunler?siralama=yeni" },
              { label: "Cok Satanlar", href: "/urunler?siralama=cok-satan" },
              { label: "Indirimliler", href: "/urunler?indirim=1" },
              { label: "Siparis Takip", href: "/siparis-takip" },
            ]}
          />
          <FooterCol
            title="Hesap"
            links={[
              { label: "Giris Yap", href: "/giris" },
              { label: "Kayit Ol", href: "/kayit" },
              { label: "Siparislerim", href: "/hesabim/siparislerim" },
              { label: "Favorilerim", href: "/favoriler" },
              { label: "Karsilastirma", href: "/karsilastir" },
            ]}
          />
          <FooterCol
            title="Kurumsal"
            links={[
              { label: "Hakkimizda", href: "/hakkimizda" },
              { label: "Iletisim", href: "/iletisim" },
              { label: "SSS", href: "/sss" },
              { label: "Iade ve Degisim", href: "/iade" },
              { label: "Mesafeli Satis Sozlesmesi", href: "/mesafeli-satis-sozlesmesi" },
              { label: "On Bilgilendirme Formu", href: "/on-bilgilendirme-formu" },
              { label: "Uyelik Sozlesmesi", href: "/uyelik-sozlesmesi" },
              { label: "KVKK Aydinlatma", href: "/kvkk" },
              { label: "Cerez Politikasi", href: "/cerez-politikasi" },
              { label: "KVKK Basvuru", href: "/kvkk-basvuru" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p>
              &copy; {new Date().getFullYear()} {BRAND.name}. Tum haklari saklidir.
            </p>
            <span className="text-neutral-300">·</span>
            <ReopenCookieConsent className="text-xs text-neutral-600 underline-offset-2 transition-colors hover:text-neutral-900 hover:underline cursor-pointer" />
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">
              VISA
            </span>
            <span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">
              MASTERCARD
            </span>
            <span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">
              TROY
            </span>
            <span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500">
              3D SECURE
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function TrustItem({
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
    <div className="flex items-center gap-2.5 sm:gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${accent}`}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-neutral-900 sm:text-sm">{title}</p>
        <p className="truncate text-[10px] text-neutral-500 sm:text-xs">{desc}</p>
      </div>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-neutral-900">
        {title}
      </h3>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
