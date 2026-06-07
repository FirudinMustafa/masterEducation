import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Mesafeli Satis Sözleşmesi",
  description:
    "Master Education mesafeli satis sözleşmesi — 6502 sayıli Tuketicinin Korunmasi Hakkinda Kanun ve Mesafeli Sözleşmeler Yonetmeligi cercevesinde duzenlenmistir.",
};

export default function DistanceSalesContractPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Mesafeli Satis Sözleşmesi
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        6502 sayıli Tuketicinin Korunmasi Hakkinda Kanun ve Mesafeli Sözleşmeler
        Yonetmeligi cercevesinde duzenlenmistir.{" "}
        Son güncelleme:{" "}
        {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Taraflar</h2>
          <h3 className="text-base font-semibold mt-3">1.1 Satici</h3>
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
            {BRAND.taxOffice && (
              <li>
                <strong>Vergi Dairesi:</strong> {BRAND.taxOffice}
              </li>
            )}
            {BRAND.taxNumber && (
              <li>
                <strong>Vergi Numarasi:</strong> {BRAND.taxNumber}
              </li>
            )}
            {BRAND.mersisNumber && (
              <li>
                <strong>MERSIS No:</strong> {BRAND.mersisNumber}
              </li>
            )}
          </ul>
          <h3 className="text-base font-semibold mt-3">1.2 Alici</h3>
          <p>
            Site uzerinden ürün satin alan ve sipariş sirasinda iletişim ve
            teslimat bilgilerini beyan eden gercek veya tuzel kisidir
            (&quot;Alici&quot;).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">2. Sözleşmenin Konusu</h2>
          <p>
            Isbu Sözleşme&apos;nin konusu; Alici&apos;nin Satici&apos;ya ait{" "}
            <a
              href="https://mastereducation.com.tr"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              mastereducation.com.tr
            </a>{" "}
            adresinden elektronik ortamda sipariş verdigi, asagida nitelikleri
            ve satis fiyati belirtilen ürün/urunlerin satisi ve teslimi ile
            ilgili olarak 6502 sayıli Tuketicinin Korunmasi Hakkinda Kanun ile
            Mesafeli Sözleşmeler Yonetmeligi hukumleri cercevesinde taraflarin
            hak ve yukumluluklerinin tespit edilmesidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            3. Sözleşme Konusu Ürün/Hizmet
          </h2>
          <p>
            Ürün(ler)in turu, miktari, marka/modeli, satis bedeli, ödeme sekli
            ve teslimat bilgileri Site uzerinde sipariş ozetinde gösterilen
            sekildedir. Sipariş onayinin ardindan Alici&apos;ya gonderilen
            sipariş ozeti email&apos;i bu Sözleşme&apos;nin ayrilmaz parcasidir.
          </p>
          <p>
            Listelenen ve sitede ilan edilen fiyatlar satis fiyatidir. Ilan
            edilen fiyatlar ve vaatler güncelleme yapilana ve degistirilene kadar
            gecerlidir. Sureli olarak ilan edilen fiyatlar ise belirtilen sure
            sonuna kadar gecerlidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">4. Genel Hukumler</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Alici, Site&apos;de sözleşme konusu ürünun temel nitelikleri,
              satis fiyati ve ödeme sekli ile teslimata iliskin on bilgileri
              okuyup bilgi sahibi oldugunu, elektronik ortamda gerekli teyidi
              verdigini kabul ve beyan eder.
            </li>
            <li>
              Sözleşme konusu ürün, yasal 30 günluk sureyi asmamak kosulu ile
              her bir ürün icin Alici&apos;nin yerlesim yerinin uzakligina bagli
              olarak Site&apos;de belirtilen sure icinde Alici veya gösterdigi
              adresteki kisi/kuruluslara, Satici&apos;nin anlasmali kargo
              firmasi tarafindan teslim edilir.
            </li>
            <li>
              Ürünun teslimati icin isbu Sözleşme&apos;nin elektronik ortamda
              teyit edilmis olmasi ve satis bedelinin Alici&apos;nin tercih
              ettigi ödeme sekli ile odenmis olmasi şarttir. Herhangi bir
              nedenle ürün bedelinin odenmemesi veya banka kayıtlarinda iptal
              edilmesi halinde, Satici ürün teslimi yukumlulugunden kurtulmus
              kabul edilir.
            </li>
            <li>
              Ürünun tesliminden sonra Alici&apos;ya ait kredi kartinin
              Alici&apos;nin kusurundan kaynaklanmayan bir sekilde yetkisiz
              kisilerce haksiz veya hukuka aykiri olarak kullanilmasi nedeni ile
              ilgili banka veya finans kurulusu&apos;nun ürün bedelini
              Satici&apos;ya ödememesi halinde, Alici&apos;nin kendisine teslim
              edilmis olmak kosuluyla ürünu Satici&apos;ya gondermesi gereklidir.
            </li>
            <li>
              Satici, sözleşme konusu ürünun saglam, eksiksiz, siparişe uygun
              özellikleri tasiyor olmasindan sorumludur.
            </li>
            <li>
              Sözleşme konusu ürünun teslimati icin Alici&apos;nin Site&apos;de
              belirttigi adresinin acik ve dogru olmasi şarttir.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">5. Cayma Hakki</h2>
          <p>
            Alici, sözleşme konusu ürünu/hizmeti teslim aldigi tarihten itibaren{" "}
            <strong>14 (on dort) gün</strong> icerisinde herhangi bir gerekce
            göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkina
            sahiptir. Cayma hakkinin kullanildigina dair bildirimin bu sure
            icinde Satici&apos;ya yazili olarak veya kalici veri saklayicisi ile
            yoneltilmesi yeterlidir.
          </p>
          <p>
            Cayma hakkinin kullanilmasi icin{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresine yazili bildirim yapilmasi yeterlidir. Cayma hakkinin
            kullanilmasi halinde Satici, cayma bildiriminin kendisine
            ulasmasindan itibaren <strong>14 gün</strong> icinde tahsil edilen
            bedeli Alici&apos;nin ödeme yontemine uygun bir sekilde iade eder.
          </p>
          <h3 className="text-base font-semibold mt-3">
            Cayma Hakkinin Kullanilamayacagi Ürünler
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Tuketicinin istekleri veya kisisel ihtiyaclari dogrultusunda
              hazirlanan ürünler.
            </li>
            <li>
              Tesliminden sonra ambalaji acilmis veya kullanilmaya baslanmis
              eğitim materyalleri (kitap, calisma kitabi vb.).
            </li>
            <li>Dijital lisanslari aktive edilmis ürünler.</li>
            <li>
              Mevzuatta cayma hakki kapsami disinda tutulan diger ürün ve
              hizmetler.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            6. Temerrut Hali ve Hukuki Sonuclari
          </h2>
          <p>
            Alici&apos;nin kredi karti ile yapmis oldugu islemlerinde temerrude
            dusmesi halinde, kart sahibi banka ile arasindaki kredi karti
            sözleşmesi cercevesinde faiz odeyecek ve bankaya karsi sorumlu
            olacaktir. Bu durumda ilgili banka hukuki yollara basvurabilir;
            dogacak masraflari ve vekalet ucretini Alici&apos;dan talep
            edebilir. Her kosulda Alici&apos;nin borcundan dolayi temerrude
            dusmesi halinde, Satici&apos;nin ugradigi zarar ve ziyandan Alici
            sorumlu olacaktir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            7. Yetkili Mahkeme
          </h2>
          <p>
            Sanayi ve Ticaret Bakanligi&apos;nca her yil Aralik ayinda ilan
            edilen parasal sinirlar dahilinde Tuketici Hakem Heyetleri,
            asildiginda Tuketici Mahkemeleri yetkilidir. Tacir/bayi siparişleri
            icin Sirket merkezinin bulundugu yer mahkemeleri ve icra daireleri
            yetkilidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">8. Yururluk</h2>
          <p>
            Site uzerinden sipariş veren Alici, isbu Sözleşme&apos;nin tüm
            şartlarini kabul etmis sayılir. Sözleşme, Alici tarafindan elektronik
            ortamda onaylandigi tarihte yururluge girer. Onay tarihi, Alici&apos;ya
            ait IP adresi ile birlikte sistemimizde saklanmakta ve sipariş
            ozeti email&apos;inde Alici&apos;ya iletilmektedir.
          </p>
        </section>

        <section className="border-t border-gray-200 pt-6 text-sm text-brand-muted">
          <p>
            Detayli iade kosullari icin{" "}
            <Link
              href="/iade"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              İade ve Degisim
            </Link>{" "}
            sayfasini, kisisel verilerin islenmesi icin{" "}
            <Link
              href="/kvkk"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              KVKK Aydınlatma Metni
            </Link>
            &apos;ni inceleyebilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}
