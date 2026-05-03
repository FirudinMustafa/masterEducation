import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sikca Sorulan Sorular",
  description:
    "Master Education siparis, kargo, odeme, bayilik ve iade konularinda sikca sorulan sorular.",
};

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: "Siparisim ne zaman kargoya verilir?",
    a: (
      <>
        Onaylanan siparisler genel olarak 1-2 is gunu icinde kargoya verilir.
        Stokta bulunmayan ozel siparisler icin hazirlik suresi degisebilir.
      </>
    ),
  },
  {
    q: "Hangi kargo firmasi ile gonderim yapiyorsunuz?",
    a: (
      <>
        Anlasmali oldugumuz kargo firmalari uzerinden gonderim yaparak teslimat
        suresini kisa tutmaya calisiyoruz. Kargo takip numaraniz siparis
        durumunuz guncellendiginde mail ile tarafiniza iletilir.
      </>
    ),
  },
  {
    q: "Kargo ucreti var mi?",
    a: (
      <>
        500 TL ve uzeri siparislerde kargo ucretsizdir. Altinda kalan
        siparisler icin sabit kargo bedeli uygulanir.
      </>
    ),
  },
  {
    q: "Odeme secenekleri nelerdir?",
    a: (
      <>
        Kredi karti ile online odeme yapabilirsiniz. Onayli bayilerimiz icin
        acik hesap calisma imkani da bulunmaktadir.
      </>
    ),
  },
  {
    q: "Bayilik islemleri icin ne yapmaliyim?",
    a: (
      <>
        Bayilik islemleri icin lutfen{" "}
        <Link
          href="/iletisim"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          iletisim sayfasi
        </Link>
        {" "}uzerinden bizimle iletisime gecin. Ekibimiz size ozel fiyat ve
        acik hesap imkanlari hakkinda bilgi verecektir.
      </>
    ),
  },
  {
    q: "Bayi fiyatlarini nasil gorurum?",
    a: (
      <>
        Onaylandiktan sonra hesabinizla giris yaptiginizda urun sayfalarinda
        size ozel iskonto uygulanmis fiyatlari goreceksiniz.
      </>
    ),
  },
  {
    q: "Sifremi unuttum, ne yapmaliyim?",
    a: (
      <>
        Giris ekranindaki{" "}
        <Link
          href="/sifremi-unuttum"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          &quot;Sifremi Unuttum&quot;
        </Link>{" "}
        baglantisini kullanarak email adresinize sifirlama linki alabilirsiniz.
      </>
    ),
  },
  {
    q: "Urunu iade edebilir miyim?",
    a: (
      <>
        Evet. Ayrintilar icin{" "}
        <Link
          href="/iade"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Iade ve Degisim
        </Link>{" "}
        sayfamizi inceleyebilirsiniz.
      </>
    ),
  },
  {
    q: "Iade suresi ne kadardir?",
    a: (
      <>
        Mesafeli Satis Sozlesmesi kapsamindaki urunlerde 14 gunluk cayma
        hakkiniz vardir. Urun teslim alindigi tarihten itibaren gecerlidir ve
        orjinal ambalajinda, kullanilmamis olarak iade edilmelidir.
      </>
    ),
  },
  {
    q: "Iade kargo ucretini kim karsilar?",
    a: (
      <>
        Urun hatali veya ayiplari ile gelirse kargo ucreti tarafimizdan
        karsilanir. Musteri kaynakli cayma hakki kullanimi durumunda ise iade
        kargo ucreti alici tarafindandir.
      </>
    ),
  },
  {
    q: "Faturam ne zaman kesilir?",
    a: (
      <>
        e-Arsiv fatura siparisin kargoya verilmesinden onceki gun icerisinde
        kesilir ve email adresinize gonderilir. Kurumsal musterilerimiz icin
        e-Fatura / e-Arsiv secenegi siparis asamasinda belirtilmelidir.
      </>
    ),
  },
  {
    q: "Kampanyalardan nasil haberdar olurum?",
    a: (
      <>
        Hesabiniza tanimli email adresine donemsel kampanya ve yeni urun
        bildirimleri gonderilir. Ayrica anasayfadaki indirim etiketi olan
        urunler icin{" "}
        <Link
          href="/urunler?indirim=1"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Indirimli Urunler
        </Link>{" "}
        listesini takip edebilirsiniz.
      </>
    ),
  },
  {
    q: "Okul/kurum icin toplu siparis verebilir miyim?",
    a: (
      <>
        Evet. Onayli bayi hesabiniz varsa{" "}
        <Link
          href="/bayi/toplu-siparis"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Bayi Panelindeki Toplu Siparis
        </Link>{" "}
        akisi ile Excel uzerinden toplu siparis verebilirsiniz. Bayi degilseniz
        yuksek adetli talepleriniz icin dogrudan bize ulasin.
      </>
    ),
  },
  {
    q: "Stokta olmayan bir urun icin ne yapabilirim?",
    a: (
      <>
        Stokta bulunmayan urunler icin urun sayfasinda yeniden stokta ikazi
        talebi olusturabilirsiniz (yakinda). O zamana kadar bizimle iletisime
        gecerek tedarik sureci hakkinda bilgi alabilirsiniz.
      </>
    ),
  },
  {
    q: "Ogretmen sertifikasi / etkinlik belgesi alabilir miyim?",
    a: (
      <>
        Belirli yayinevlerinin ogretmen paketleri (ornek: Incredible, Smiles,
        Happy Hearts) sertifika sunmaktadir. Katalogdaki urun aciklamalari
        icinde belirtilmis olan sertifika bilgisini kontrol edebilir veya bize
        ulasarak bilgi alabilirsiniz.
      </>
    ),
  },
  {
    q: "Hesabimi nasil silerim (KVKK)?",
    a: (
      <>
        Hesap &rarr;{" "}
        <Link
          href="/hesabim/hesabi-sil"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Hesabi Sil
        </Link>{" "}
        akisi ile hesabinizi kalici olarak kapatabilirsiniz. Siparis gecmisi
        varsa kisisel bilgileriniz anonimize edilir, yasal muhasebe kayitlari
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
    q: "Siparisimi nasil takip ederim?",
    a: (
      <>
        Uye kullanicilar{" "}
        <Link
          href="/hesabim/siparislerim"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Siparislerim
        </Link>{" "}
        sayfasindan, misafir siparis verenler ise{" "}
        <Link
          href="/siparis-takip"
          className="text-brand-gold-dark font-medium hover:underline"
        >
          Siparis Takip
        </Link>{" "}
        ekranindan email + siparis numarasi ile sorgulama yapabilir.
      </>
    ),
  },
  {
    q: "Kargo tutari KDV dahil mi?",
    a: (
      <>
        Kargo bedeli KDV dahil olarak hesaplanip gosterilir. Faturada ayri bir
        satir olarak yer alir.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Sikca Sorulan Sorular
      </h1>
      <p className="text-brand-muted mb-8">
        Siparis, kargo, odeme ve bayilik hakkinda en cok sorulan sorular.
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
