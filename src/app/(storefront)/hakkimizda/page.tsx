import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Hakkimizda",
  description:
    "Master Education egitim materyalleri ve yabanci dil kitaplari konusunda Turkiye genelinde hizmet vermektedir.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-6">
        Hakkimizda
      </h1>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <p>
          {BRAND.name}, egitim materyalleri ve yabanci dil kitaplari alaninda
          ogrenciler, ogretmenler, kurumlar ve dagitim bayilerine hizmet veren
          bir dagitim firmasidir.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          Ne Yapiyoruz
        </h2>
        <p>
          ELT, DaF ve MEB basimi kitaplar basta olmak uzere genis bir urun
          yelpazesini bireysel ve toptan olarak sunuyoruz. Okullar, dil
          kurslari ve kirtasiyelerle uzun soluklu is birlikleri gelistiriyoruz.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          Bayilik
        </h2>
        <p>
          Kurumsal bayilerimize ozel fiyatlandirma, acik hesap calisma imkani
          ve hizli tedarik sagliyoruz. Detayli bilgi icin{" "}
          <a href="/iletisim" className="text-brand-gold-dark font-medium hover:underline">
            iletisim sayfasi
          </a>
          {" "}uzerinden bizimle iletisime gecebilirsiniz.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          Iletisim
        </h2>
        <p>
          Sorulariniz icin{" "}
          <a href="/iletisim" className="text-brand-gold-dark font-medium hover:underline">
            iletisim sayfamizdan
          </a>{" "}
          bize ulasabilirsiniz.
        </p>
      </div>
    </div>
  );
}
