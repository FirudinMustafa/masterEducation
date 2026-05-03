import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Iletisim",
  description: "Master Education iletisim bilgileri, telefon, email, adres ve iletisim formu.",
};

export default function ContactPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Iletisim
      </h1>
      <p className="text-brand-muted mb-10">
        Siparisleriniz, bayilik ve toptan talepleriniz icin bize ulasin.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-brand-border/50 p-5">
            <h2 className="font-semibold text-brand-black mb-2">Telefon</h2>
            <a
              href={`tel:${BRAND.phone.replace(/\s/g, "")}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.phone}
            </a>
            <p className="text-xs text-brand-muted mt-1">Hafta ici 09:00 - 18:00</p>
          </div>

          <div className="bg-white rounded-2xl border border-brand-border/50 p-5">
            <h2 className="font-semibold text-brand-black mb-2">WhatsApp</h2>
            <a
              href={BRAND.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Hemen Yazin
            </a>
            <p className="text-xs text-brand-muted mt-1">Hizli yanit.</p>
          </div>

          <div className="bg-white rounded-2xl border border-brand-border/50 p-5">
            <h2 className="font-semibold text-brand-black mb-2">Email</h2>
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>
            <p className="text-xs text-brand-muted mt-1">Siparis, iade ve kurumsal talepler.</p>
          </div>

          <div className="bg-white rounded-2xl border border-brand-border/50 p-5">
            <h2 className="font-semibold text-brand-black mb-2">Adres</h2>
            <p className="text-sm text-brand-black">{BRAND.address}</p>
            <p className="text-xs text-brand-muted mt-1">Kurumsal ziyaretler icin randevu alabilirsiniz.</p>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
