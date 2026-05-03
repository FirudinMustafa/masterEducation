import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "On Bilgilendirme Formu",
  description:
    "Master Education on bilgilendirme formu — 6502 sayili Tuketicinin Korunmasi Hakkinda Kanun ve Mesafeli Sozlesmeler Yonetmeligi gereginceyle hazirlanmistir.",
};

export default function PreliminaryInfoFormPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        On Bilgilendirme Formu
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Mesafeli Sozlesmeler Yonetmeligi&apos;nin 5. maddesi uyarinca, alicinin
        siparis vermeden once bilgilendirilmesi gereken hususlari icermektedir.
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Saticinin Bilgileri</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Unvan:</strong> {BRAND.name}
            </li>
            <li>
              <strong>Adres:</strong> {BRAND.address}
            </li>
            <li>
              <strong>Telefon:</strong>{" "}
              <a
                href={`tel:${BRAND.phone.replace(/\s/g, "")}`}
                className="text-brand-gold-dark font-medium hover:underline"
              >
                {BRAND.phone}
              </a>
            </li>
            <li>
              <strong>E-posta:</strong>{" "}
              <a
                href={`mailto:${BRAND.email}`}
                className="text-brand-gold-dark font-medium hover:underline"
              >
                {BRAND.email}
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            2. Sozlesme Konusu Mal/Hizmetin Temel Nitelikleri
          </h2>
          <p>
            Site&apos;de sergilenen urunlerin temel ozellikleri, marka,
            yayinevi, dil bilgisi, baski yili gibi nitelikleri urun detay
            sayfasinda yer almaktadir. Site&apos;de yer alan tum gorsel ve
            metinler urunlerin tanitimi amaciyla hazirlanmistir; baski donemine
            gore kucuk gorsel farkliliklar olusabilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">3. Satis Fiyati</h2>
          <p>
            Site&apos;de gosterilen tutarlar perakende satis fiyatlaridir; KDV
            dahildir. Bayi statusundeki musterilere uygulanan ozel iskontolar
            bayi paneli ve sepet ekraninda ayrica gosterilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">4. Odeme Sekli</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Kredi/Banka Karti</strong> — guvenli 3D Secure dogrulama
              ile.
            </li>
            <li>
              <strong>Acik Hesap (Cari)</strong> — sadece onayli bayi
              statusundeki musteriler icin.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            5. Teslimat Bilgileri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Siparisleriniz, odemenin tamamlanmasi ve onaylanmasinin ardindan
              en gec <strong>30 gun</strong> icinde Alici&apos;nin belirttigi
              teslimat adresine, anlasmali kargo firmamiz araciligiyla teslim
              edilir.
            </li>
            <li>
              Teslimat bedeli (kargo bedeli) sepet/ozet ekraninda gosterilir.
              500 TL ve uzeri siparislerde kargo ucretsizdir; bayi
              siparislerinde kargo her zaman ucretsizdir.
            </li>
            <li>
              Adresin yanlis veya eksik bildirilmesinden kaynakli teslim edilemeyen
              siparislerden Satici sorumlu degildir.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            6. Cayma Hakki ve Iade Kosullari
          </h2>
          <p>
            Alici, mali teslim aldigi veya sozlesmenin imzalandigi tarihten
            itibaren <strong>14 gun</strong> icerisinde herhangi bir gerekce
            gostermeksizin ve cezai sart odemeksizin mesafeli sozlesmeden cayma
            hakkina sahiptir.
          </p>
          <p>
            Cayma hakkinin kullanilmasi icin bu sure icerisinde{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresine yazili bildirim yapilmasi yeterlidir. Cayma halinde
            urunun, ambalaji acilmamis, kullanilmamis ve yeniden satilabilir
            durumda Satici&apos;ya iade edilmesi gerekir.
          </p>
          <p>
            Cayma hakki bildiriminin Satici&apos;ya ulasmasindan itibaren 14 gun
            icinde urun bedeli Alici&apos;ya iade edilir. Detayli iade akisi
            icin{" "}
            <Link
              href="/iade"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Iade ve Degisim
            </Link>{" "}
            sayfasini inceleyiniz.
          </p>
          <h3 className="text-base font-semibold mt-3">
            Cayma Hakkinin Kullanilamayacagi Haller
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ambalaji acilmis veya kullanilmaya baslanmis basili egitim materyalleri.</li>
            <li>Dijital lisanslari aktive edilmis urunler.</li>
            <li>Tuketicinin kisisel istekleri dogrultusunda hazirlanan urunler.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            7. Sikayet ve Itiraz Yollari
          </h2>
          <p>
            Sikayet ve itirazlariniz icin Sanayi ve Ticaret Bakanligi&apos;nca
            her yil Aralik ayinda belirlenen parasal sinirlar dahilinde
            yerlesim yerinizdeki veya tuketici isleminin yapildigi yerdeki
            <strong> Tuketici Hakem Heyeti</strong>&apos;ne, asildiginda{" "}
            <strong>Tuketici Mahkemesi</strong>&apos;ne basvurabilirsiniz.
          </p>
        </section>

        <section className="border-t border-gray-200 pt-6 text-sm text-brand-muted">
          <p>
            Bu form, siparis onaylanmadan once tarafiniza okutturulur ve
            siparis tamamlandiginda email yoluyla bir kopyasi tarafiniza
            iletilir. Mesafeli Satis Sozlesmesi&apos;nin tam metnine{" "}
            <Link
              href="/mesafeli-satis-sozlesmesi"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              buradan
            </Link>{" "}
            ulasabilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}
