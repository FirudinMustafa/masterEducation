import type { Metadata } from "next";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Iade ve Degisim",
  description:
    "Master Education iade ve degisim kosullari, suresi ve izlenecek adimlar.",
};

export default function ReturnPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Iade ve Degisim Kosullari
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Tuketici haklari ve mesafeli satis mevzuati uyarinca hazirlanmistir.
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <h2 className="text-xl font-display font-semibold">Cayma Hakki</h2>
        <p>
          Teslim aldiginiz tarihten itibaren <strong>14 gun</strong> icinde
          herhangi bir gerekce gostermeksizin sozlesmeden cayma hakkina
          sahipsiniz. Urunler acilmamis, kullanilmamis ve yeniden satisa
          elverisli durumda olmalidir.
        </p>

        <h2 className="text-xl font-display font-semibold">Iade Sureci</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Iade talebinizi{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresine siparis numaraniz ile birlikte iletin.
          </li>
          <li>
            Anlasmali kargo ile urunleri tarafimiza gonderin (gonderim bedeli
            tarafimizca karsilanir).
          </li>
          <li>
            Urun tesliminden ve incelemesinden sonra 10 is gunu icerisinde
            odeme iadesi baslatilir.
          </li>
        </ol>

        <h2 className="text-xl font-display font-semibold">
          Iade Edilemeyecek Urunler
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Ambalaji acilmis, kullanilmis veya hasar gormus egitim materyalleri
          </li>
          <li>Dijital lisanslari aktive edilmis urunler</li>
          <li>Ozel siparis olarak hazirlanmis urunler</li>
        </ul>

        <h2 className="text-xl font-display font-semibold">
          Hatali veya Eksik Urun
        </h2>
        <p>
          Siparisiniz eksik, hatali veya hasarli ulasti ise teslim aldiginiz
          tarihten itibaren <strong>48 saat</strong> icinde bizimle iletisime
          gecin. Bu durumda kargo masraflari tarafimizca karsilanir ve urun
          yenilenir.
        </p>

        <h2 className="text-xl font-display font-semibold">Bayi Siparisleri</h2>
        <p>
          Bayilik sozlesmesi kapsamindaki toplu siparislerin iade kosullari
          ayri sozlesme hukumleri ile belirlenir. Detay icin bayi temsilciniz
          ile iletisime gecebilirsiniz.
        </p>
      </div>
    </div>
  );
}
