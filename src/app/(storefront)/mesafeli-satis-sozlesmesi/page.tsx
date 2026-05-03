import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Mesafeli Satis Sozlesmesi",
  description:
    "Master Education mesafeli satis sozlesmesi — 6502 sayili Tuketicinin Korunmasi Hakkinda Kanun ve Mesafeli Sozlesmeler Yonetmeligi cercevesinde duzenlenmistir.",
};

export default function DistanceSalesContractPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Mesafeli Satis Sozlesmesi
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        6502 sayili Tuketicinin Korunmasi Hakkinda Kanun ve Mesafeli Sozlesmeler
        Yonetmeligi cercevesinde duzenlenmistir.{" "}
        Son guncelleme:{" "}
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
            Site uzerinden urun satin alan ve siparis sirasinda iletisim ve
            teslimat bilgilerini beyan eden gercek veya tuzel kisidir
            (&quot;Alici&quot;).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">2. Sozlesmenin Konusu</h2>
          <p>
            Isbu Sozlesme&apos;nin konusu; Alici&apos;nin Satici&apos;ya ait{" "}
            <a
              href="https://mastereducation.com.tr"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              mastereducation.com.tr
            </a>{" "}
            adresinden elektronik ortamda siparis verdigi, asagida nitelikleri
            ve satis fiyati belirtilen urun/urunlerin satisi ve teslimi ile
            ilgili olarak 6502 sayili Tuketicinin Korunmasi Hakkinda Kanun ile
            Mesafeli Sozlesmeler Yonetmeligi hukumleri cercevesinde taraflarin
            hak ve yukumluluklerinin tespit edilmesidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            3. Sozlesme Konusu Urun/Hizmet
          </h2>
          <p>
            Urun(ler)in turu, miktari, marka/modeli, satis bedeli, odeme sekli
            ve teslimat bilgileri Site uzerinde siparis ozetinde gosterilen
            sekildedir. Siparis onayinin ardindan Alici&apos;ya gonderilen
            siparis ozeti email&apos;i bu Sozlesme&apos;nin ayrilmaz parcasidir.
          </p>
          <p>
            Listelenen ve sitede ilan edilen fiyatlar satis fiyatidir. Ilan
            edilen fiyatlar ve vaatler guncelleme yapilana ve degistirilene kadar
            gecerlidir. Sureli olarak ilan edilen fiyatlar ise belirtilen sure
            sonuna kadar gecerlidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">4. Genel Hukumler</h2>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Alici, Site&apos;de sozlesme konusu urunun temel nitelikleri,
              satis fiyati ve odeme sekli ile teslimata iliskin on bilgileri
              okuyup bilgi sahibi oldugunu, elektronik ortamda gerekli teyidi
              verdigini kabul ve beyan eder.
            </li>
            <li>
              Sozlesme konusu urun, yasal 30 gunluk sureyi asmamak kosulu ile
              her bir urun icin Alici&apos;nin yerlesim yerinin uzakligina bagli
              olarak Site&apos;de belirtilen sure icinde Alici veya gosterdigi
              adresteki kisi/kuruluslara, Satici&apos;nin anlasmali kargo
              firmasi tarafindan teslim edilir.
            </li>
            <li>
              Urunun teslimati icin isbu Sozlesme&apos;nin elektronik ortamda
              teyit edilmis olmasi ve satis bedelinin Alici&apos;nin tercih
              ettigi odeme sekli ile odenmis olmasi sarttir. Herhangi bir
              nedenle urun bedelinin odenmemesi veya banka kayitlarinda iptal
              edilmesi halinde, Satici urun teslimi yukumlulugunden kurtulmus
              kabul edilir.
            </li>
            <li>
              Urunun tesliminden sonra Alici&apos;ya ait kredi kartinin
              Alici&apos;nin kusurundan kaynaklanmayan bir sekilde yetkisiz
              kisilerce haksiz veya hukuka aykiri olarak kullanilmasi nedeni ile
              ilgili banka veya finans kurulusu&apos;nun urun bedelini
              Satici&apos;ya odememesi halinde, Alici&apos;nin kendisine teslim
              edilmis olmak kosuluyla urunu Satici&apos;ya gondermesi gereklidir.
            </li>
            <li>
              Satici, sozlesme konusu urunun saglam, eksiksiz, siparise uygun
              ozellikleri tasiyor olmasindan sorumludur.
            </li>
            <li>
              Sozlesme konusu urunun teslimati icin Alici&apos;nin Site&apos;de
              belirttigi adresinin acik ve dogru olmasi sarttir.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">5. Cayma Hakki</h2>
          <p>
            Alici, sozlesme konusu urunu/hizmeti teslim aldigi tarihten itibaren{" "}
            <strong>14 (on dort) gun</strong> icerisinde herhangi bir gerekce
            gostermeksizin ve cezai sart odemeksizin sozlesmeden cayma hakkina
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
            ulasmasindan itibaren <strong>14 gun</strong> icinde tahsil edilen
            bedeli Alici&apos;nin odeme yontemine uygun bir sekilde iade eder.
          </p>
          <h3 className="text-base font-semibold mt-3">
            Cayma Hakkinin Kullanilamayacagi Urunler
          </h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Tuketicinin istekleri veya kisisel ihtiyaclari dogrultusunda
              hazirlanan urunler.
            </li>
            <li>
              Tesliminden sonra ambalaji acilmis veya kullanilmaya baslanmis
              egitim materyalleri (kitap, calisma kitabi vb.).
            </li>
            <li>Dijital lisanslari aktive edilmis urunler.</li>
            <li>
              Mevzuatta cayma hakki kapsami disinda tutulan diger urun ve
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
            sozlesmesi cercevesinde faiz odeyecek ve bankaya karsi sorumlu
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
            asildiginda Tuketici Mahkemeleri yetkilidir. Tacir/bayi siparisleri
            icin Sirket merkezinin bulundugu yer mahkemeleri ve icra daireleri
            yetkilidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">8. Yururluk</h2>
          <p>
            Site uzerinden siparis veren Alici, isbu Sozlesme&apos;nin tum
            sartlarini kabul etmis sayilir. Sozlesme, Alici tarafindan elektronik
            ortamda onaylandigi tarihte yururluge girer. Onay tarihi, Alici&apos;ya
            ait IP adresi ile birlikte sistemimizde saklanmakta ve siparis
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
              Iade ve Degisim
            </Link>{" "}
            sayfasini, kisisel verilerin islenmesi icin{" "}
            <Link
              href="/kvkk"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              KVKK Aydinlatma Metni
            </Link>
            &apos;ni inceleyebilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}
