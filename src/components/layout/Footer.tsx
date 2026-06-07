import Link from "next/link";
import { BRAND } from "@/lib/constants";
import { Logo } from "@/components/ui/logo";
import { ReopenCookieConsent } from "@/components/legal/cookie-consent";
import {
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
} from "@/components/ui/icons";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-white">
      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 md:py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 sm:gap-8 lg:grid-cols-5 lg:gap-10">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <Logo size="xl" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-neutral-600">
              ELT, DaF, MEB ve dunyanin onde gelen yayınevlerinin eğitim materyalleri.
              Bayilere özel toptan tedarik, bayi agi ve 4898+ ürün.
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
            title="Katalog"
            links={[
              { label: "Tüm Ürünler", href: "/urunler" },
              { label: "Yeni Gelenler", href: "/urunler?siralama=yeni" },
              { label: "Çok Satanlar", href: "/urunler?siralama=çok-satan" },
              { label: "Yayınevleri", href: "/yayinevleri" },
              { label: "Sipariş Takip", href: "/siparis-takip" },
            ]}
          />
          <FooterCol
            title="Bayilik"
            links={[
              { label: "Bayi Girişi", href: "/giris" },
              { label: "Bayi Başvuru", href: "/bayi-basvuru" },
            ]}
          />
          <FooterCol
            title="Kurumsal"
            links={[
              { label: "Hakkımızda", href: "/hakkimizda" },
              { label: "İletişim", href: "/iletisim" },
              { label: "SSS", href: "/sss" },
              { label: "İade ve Degisim", href: "/iade" },
              { label: "Mesafeli Satis Sözleşmesi", href: "/mesafeli-satis-sozlesmesi" },
              { label: "On Bilgilendirme Formu", href: "/on-bilgilendirme-formu" },
              { label: "Üyelik Sözleşmesi", href: "/uyelik-sozlesmesi" },
              { label: "KVKK Aydınlatma", href: "/kvkk" },
              { label: "Çerez Politikasi", href: "/cerez-politikasi" },
              { label: "KVKK Basvuru", href: "/kvkk-basvuru" },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p>
              &copy; {new Date().getFullYear()} {BRAND.name}. Tüm haklari saklidir.
            </p>
            <span className="text-neutral-300">·</span>
            <ReopenCookieConsent className="text-xs text-neutral-600 underline-offset-2 transition-colors hover:text-neutral-900 hover:underline cursor-pointer" />
          </div>
        </div>
      </div>
    </footer>
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
