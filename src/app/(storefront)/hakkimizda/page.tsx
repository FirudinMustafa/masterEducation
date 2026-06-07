import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Hakkımızda",
  description:
    "Master Education eğitim materyalleri ve yabanci dil kitaplari konusunda Turkiye genelinde hizmet vermektedir.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-6">
        Hakkımızda
      </h1>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <p>
          {BRAND.name}, eğitim materyalleri ve yabanci dil kitaplari alaninda
          ogrenciler, ogretmenler, kurumlar ve dagitim bayilerine hizmet veren
          bir dagitim firmasidir.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          Ne Yapiyoruz
        </h2>
        <p>
          ELT, DaF ve MEB basimi kitaplar basta olmak uzere genis bir ürün
          yelpazesini bireysel ve toptan olarak sunuyoruz. Okullar, dil
          kurslari ve kirtasiyelerle uzun soluklu is birlikleri gelistiriyoruz.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          Bayilik
        </h2>
        <p>
          Kurumsal bayilerimize özel fiyatlandirma, acik hesap calisma imkani
          ve hızlı tedarik sagliyoruz. Detayli bilgi icin{" "}
          <a href="/iletisim" className="text-brand-gold-dark font-medium hover:underline">
            iletişim sayfasi
          </a>
          {" "}uzerinden bizimle iletişime gecebilirsiniz.
        </p>

        <h2 className="text-xl font-display font-semibold text-brand-black">
          İletişim
        </h2>
        <p>
          Sorulariniz icin{" "}
          <a href="/iletisim" className="text-brand-gold-dark font-medium hover:underline">
            iletişim sayfamizdan
          </a>{" "}
          bize ulasabilirsiniz.
        </p>
      </div>
    </div>
  );
}
