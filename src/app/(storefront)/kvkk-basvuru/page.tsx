import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";
import { KvkkApplicationForm } from "./form";

export const metadata: Metadata = {
  title: "KVKK Veri Sahibi Basvuru Formu",
  description:
    "6698 sayıli Kisisel Verilerin Korunmasi Kanunu kapsaminda veri sahibi basvuru formu — Master Education.",
};

export default function KvkkApplicationPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <Link
          href="/kvkk"
          className="text-xs text-brand-muted hover:text-brand-black"
        >
          &larr; KVKK Aydınlatma Metni
        </Link>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-black mb-2">
          KVKK Veri Sahibi Basvuru Formu
        </h1>
        <p className="text-sm text-brand-muted">
          6698 sayıli Kisisel Verilerin Korunmasi Kanunu&apos;nun 11. ve 13.
          maddeleri kapsaminda haklarinizi bu form uzerinden kullanabilirsiniz.
          Talebiniz en gec <strong>30 gün</strong> icinde sonuclandirilir.
        </p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 mb-8">
        <p className="font-semibold mb-1">Önemli</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Basvurunuzun kabul edilebilmesi icin kimliginizi tespit etmeye
            yardimci bilgileri eksiksiz girmeniz gerekir.
          </li>
          <li>
            Sirket olarak basvuruyu sahsen yapan kisinin ilgili veri sahibi
            oldugunu dogrulayamadigimiz durumlarda ek belge isteyebiliriz.
          </li>
          <li>
            Basvurunuz, KVKK madde 13/2 uyarınca <strong>ücretsizdir</strong>;
            ancak ayni mahiyetteki tekrarlanan basvurularda Kurul tarafindan
            belirlenen ucret tarifesi uygulanabilir.
          </li>
        </ul>
      </div>

      <KvkkApplicationForm />

      <div className="mt-8 text-xs text-brand-muted">
        <p>
          Alternatif olarak basvurunuzu{" "}
          <a
            href={`mailto:${BRAND.email}`}
            className="text-brand-gold-dark font-medium hover:underline"
          >
            {BRAND.email}
          </a>{" "}
          adresine kimliginizi tespit edici bir belge ile (vatandaslik / pasaport
          fotokopisi) yazili olarak da iletebilirsiniz.
        </p>
      </div>
    </div>
  );
}
