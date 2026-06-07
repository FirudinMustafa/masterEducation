import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sıkça Sorulan Sorular",
  description:
    "Master Education sipariş, kargo, ödeme, bayilik ve iade konularinda sıkça sorulan sorular.",
};

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Siparişim ne zaman kargoya verilir?",
    a: (
      <>
        Onaylanan siparişler genel olarak 1-2 is günu icinde kargoya verilir.
        Stokta bulunmayan özel siparişler icin hazirlik suresi degisebilir.
      </>
    ),
  },
  {
    q: "Hangi kargo firmasi ile gonderim yapiyorsunuz?",
    a: (
      <>
        Anlasmali oldugumuz kargo firmalari uzerinden gonderim yaparak teslimat
        suresini kisa tutmaya calisiyoruz. Kargo takip numaraniz sipariş
        durumunuz güncellendiginde mail ile tarafiniza iletilir.
      </>
    ),
  },
  {
    q: "Kargo ucreti var mi?",
    a: (
      <>
        500 TL ve uzeri siparişlerde kargo ücretsizdir. Altinda kalan
        siparişler icin sabit kargo bedeli uygulanir.
      </>
    ),
  },
  {
    q: "Ödeme secenekleri nelerdir?",
    a: (
      <>
        Kredi karti ile online ödeme yapabilirsiniz. Onaylı bayilerimiz icin
        acik hesap calisma imkani da bulunmaktadir.
      </>
    ),
  },
  {
    q: "Bayilik islemleri icin ne yapmaliyim?",
    a: (
      <>
        Bayilik islemleri icin lütfen{" "}
        <Link
          href="/iletisim"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          iletişim sayfasi
        </Link>
        {" "}uzerinden bizimle iletişime gecin. Ekibimiz size özel fiyat ve
        acik hesap imkanlari hakkinda bilgi verecektir.
      </>
    ),
  },
  {
    q: "Bayi fiyatlarini nasil gorurum?",
    a: (
      <>
        Onaylandiktan sonra hesabinizla giriş yaptiginizda ürün sayfalarinda
        size özel iskonto uygulanmis fiyatlari göreceksiniz.
      </>
    ),
  },
  {
    q: "Şifremi unuttum, ne yapmaliyim?",
    a: (
      <>
        Giriş ekranindaki{" "}
        <Link
          href="/sifremi-unuttum"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          &quot;Şifremi Unuttum&quot;
        </Link>{" "}
        baglantisini kullanarak email adresinize sifirlama linki alabilirsiniz.
      </>
    ),
  },
  {
    q: "Ürünu iade edebilir miyim?",
    a: (
      <>
        Evet. Ayrintilar icin{" "}
        <Link
          href="/iade"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          İade ve Degisim
        </Link>{" "}
        sayfamizi inceleyebilirsiniz.
      </>
    ),
  },
  {
    q: "İade suresi ne kadardir?",
    a: (
      <>
        Mesafeli Satis Sözleşmesi kapsamindaki ürünlerde 14 günluk cayma
        hakkiniz vardir. Ürün teslim alindigi tarihten itibaren gecerlidir ve
        orjinal ambalajinda, kullanilmamis olarak iade edilmelidir.
      </>
    ),
  },
  {
    q: "İade kargo ucretini kim karsilar?",
    a: (
      <>
        Ürün hatali veya ayiplari ile gelirse kargo ucreti tarafimizdan
        karsilanir. Musteri kaynakli cayma hakki kullanimi durumunda ise iade
        kargo ucreti alici tarafindandir.
      </>
    ),
  },
  {
    q: "Faturam ne zaman kesilir?",
    a: (
      <>
        e-Arsiv fatura siparişin kargoya verilmesinden önceki gün icerisinde
        kesilir ve email adresinize gonderilir. Kurumsal musterilerimiz icin
        e-Fatura / e-Arsiv secenegi sipariş asamasinda belirtilmelidir.
      </>
    ),
  },
  {
    q: "Kampanyalardan nasil haberdar olurum?",
    a: (
      <>
        Hesabiniza tanimli email adresine donemsel kampanya ve yeni ürün
        bildirimleri gonderilir. Ayrica anasayfadaki indirim etiketi olan
        ürünler icin{" "}
        <Link
          href="/urunler?indirim=1"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          İndirimli Ürünler
        </Link>{" "}
        listesini takip edebilirsiniz.
      </>
    ),
  },
  {
    q: "Okul/kurum icin toplu sipariş verebilir miyim?",
    a: (
      <>
        Evet. Onaylı bayi hesabiniz varsa{" "}
        <Link
          href="/bayi/toplu-siparis"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Bayi Panelindeki Toplu Sipariş
        </Link>{" "}
        akisi ile Excel uzerinden toplu sipariş verebilirsiniz. Bayi degilseniz
        yuksek adetli talepleriniz icin dogrudan bize ulasin.
      </>
    ),
  },
  {
    q: "Stokta olmayan bir ürün icin ne yapabilirim?",
    a: (
      <>
        Stokta bulunmayan ürünler icin ürün sayfasinda yeniden stokta ikazi
        talebi oluşturabilirsiniz (yakinda). O zamana kadar bizimle iletişime
        gecerek tedarik sureci hakkinda bilgi alabilirsiniz.
      </>
    ),
  },
  {
    q: "Ogretmen sertifikasi / etkinlik belgesi alabilir miyim?",
    a: (
      <>
        Belirli yayınevlerinin ogretmen paketleri (ornek: Incredible, Smiles,
        Happy Hearts) sertifika sunmaktadir. Katalogdaki ürün açıklamalari
        icinde belirtilmis olan sertifika bilgisini kontrol edebilir veya bize
        ulasarak bilgi alabilirsiniz.
      </>
    ),
  },
  {
    q: "Hesabımi nasil silerim (KVKK)?",
    a: (
      <>
        Hesap &rarr;{" "}
        <Link
          href="/hesabim/hesabi-sil"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Hesabi Sil
        </Link>{" "}
        akisi ile hesabinizi kalici olarak kapatabilirsiniz. Sipariş gecmisi
        varsa kisisel bilgileriniz anonimize edilir, yasal muhasebe kayıtlari
        korunur.
      </>
    ),
  },
  {
    q: "Kisisel verilerim nasil korunuyor?",
    a: (
      <>
        KVKK kapsamindaki bilgilendirme icin{" "}
        <Link
          href="/kvkk"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          KVKK
        </Link>{" "}
        sayfamizi inceleyebilirsiniz. Verileriniz ucuncu taraflarla pazarlama
        amaciyla paylasilmaz.
      </>
    ),
  },
  {
    q: "Siparişimi nasil takip ederim?",
    a: (
      <>
        Üye kullanıcılar{" "}
        <Link
          href="/hesabim/siparislerim"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Siparişlerim
        </Link>{" "}
        sayfasindan, misafir sipariş verenler ise{" "}
        <Link
          href="/siparis-takip"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Sipariş Takip
        </Link>{" "}
        ekranindan email + sipariş numarasi ile sorgulama yapabilir.
      </>
    ),
  },
  {
    q: "Kargo tutari KDV dahil mi?",
    a: (
      <>
        Kargo bedeli KDV dahil olarak hesaplanip gösterilir. Faturada ayri bir
        satir olarak yer alir.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Sıkça Sorulan Sorular
      </h1>
      <p className="text-brand-muted mb-8">
        Sipariş, kargo, ödeme ve bayilik hakkinda en çok sorulan sorular.
      </p>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <details
            key={i}
            className="bg-white rounded-xl border border-brand-border/50 p-5 group"
          >
            <summary className="font-semibold text-brand-black cursor-pointer list-none flex items-center justify-between">
              <span>{item.q}</span>
              <span className="text-brand-gold-dark text-xl group-open:rotate-45 transition-transform">
                +
              </span>
            </summary>
            <div className="text-sm text-brand-black mt-3 leading-relaxed">
              {item.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
