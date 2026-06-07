import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "İade ve Degisim",
  description:
    "Master Education iade ve degisim kosullari, suresi ve izlenecek adımlar.",
};

export default function ReturnPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        İade ve Degisim Kosullari
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Tuketici haklari ve mesafeli satis mevzuati uyarınca hazirlanmistir.
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <h2 className="text-xl font-display font-semibold">Cayma Hakki</h2>
        <p>
          Teslim aldiginiz tarihten itibaren <strong>14 gün</strong> icinde
          herhangi bir gerekce göstermeksizin sözleşmeden cayma hakkina
          sahipsiniz. Ürünler acilmamis, kullanilmamis ve yeniden satisa
          elverisli durumda olmalidir.
        </p>

        <h2 className="text-xl font-display font-semibold">İade Sureci</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            İade talebinizi{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresine sipariş numaraniz ile birlikte iletin.
          </li>
          <li>
            Anlasmali kargo ile ürünleri tarafimiza gonderin (gonderim bedeli
            tarafimizca karsilanir).
          </li>
          <li>
            Ürün tesliminden ve incelemesinden sonra 10 is günu icerisinde
            ödeme iadesi baslatilir.
          </li>
        </ol>

        <h2 className="text-xl font-display font-semibold">
          İade Edilemeyecek Ürünler
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Ambalaji acilmis, kullanilmis veya hasar gormus eğitim materyalleri
          </li>
          <li>Dijital lisanslari aktive edilmis ürünler</li>
          <li>Özel sipariş olarak hazirlanmis ürünler</li>
        </ul>

        <h2 className="text-xl font-display font-semibold">
          Hatali veya Eksik Ürün
        </h2>
        <p>
          Siparişiniz eksik, hatali veya hasarli ulasti ise teslim aldiginiz
          tarihten itibaren <strong>48 saat</strong> icinde bizimle iletişime
          gecin. Bu durumda kargo masraflari tarafimizca karsilanir ve ürün
          yenilenir.
        </p>

        <h2 className="text-xl font-display font-semibold">Bayi Siparişleri</h2>
        <p>
          Bayilik sözleşmesi kapsamindaki toplu siparişlerin iade kosullari
          ayri sözleşme hukumleri ile belirlenir. Detay icin bayi temsilciniz
          ile iletişime gecebilirsiniz.
        </p>
      </div>
    </div>
  );
}
