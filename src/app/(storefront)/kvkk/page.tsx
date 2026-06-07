import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "KVKK Aydınlatma Metni",
  description:
    "Master Education kisisel verilerin korunmasi kanunu (KVKK) aydınlatma metni — veri sorumlusu, isleme amaclari, aktarim ve haklariniz.",
};

export default function KvkkPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        KVKK Aydınlatma Metni
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        6698 sayıli Kisisel Verilerin Korunmasi Kanunu kapsaminda hazirlanmistir.{" "}
        Son güncelleme:{" "}
        {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Veri Sorumlusu</h2>
          <p>
            <strong>{BRAND.name}</strong> (&quot;Sirket&quot;), 6698 sayıli
            Kisisel Verilerin Korunmasi Kanunu (&quot;KVKK&quot;) kapsaminda{" "}
            <strong>veri sorumlusu</strong> sifatiyla hareket etmektedir.
            İletişim bilgileri:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              E-posta:{" "}
              <a
                href={`mailto:${BRAND.email}`}
                className="text-brand-gold-dark font-medium hover:underline"
              >
                {BRAND.email}
              </a>
            </li>
            <li>
              Telefon:{" "}
              <a
                href={`tel:${BRAND.phone.replace(/\s/g, "")}`}
                className="text-brand-gold-dark font-medium hover:underline"
              >
                {BRAND.phone}
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            2. Islenen Kisisel Veri Kategorileri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Kimlik bilgileri</strong>: ad, soyad, TC kimlik no
              (yalnizca fatura/bayi basvurusunda istendiginde).
            </li>
            <li>
              <strong>İletişim bilgileri</strong>: e-posta adresi, telefon
              numarasi, posta adresi, il/ilce.
            </li>
            <li>
              <strong>Musteri islem bilgileri</strong>: sipariş gecmisi, sepet
              icerigi, fatura bilgileri, ürün degerlendirmeleri.
            </li>
            <li>
              <strong>Bayilik bilgileri</strong>: firma unvani, vergi dairesi,
              vergi numarasi, ticaret sicil bilgileri, imza sirkuleri/vergi
              levhasi gibi belgeler.
            </li>
            <li>
              <strong>Ödeme bilgileri</strong>: kart sahibi adi, kartin son 4
              hanesi, marka (kart numarasinin tamami saklanmaz).
            </li>
            <li>
              <strong>Islem guvenligi bilgileri</strong>: IP adresi, oturum
              kayıtlari, tarayici/cihaz bilgisi, log kayıtlari.
            </li>
            <li>
              <strong>Pazarlama bilgileri</strong>: izin verdiginiz takdirde
              ticari elektronik ileti onayinizin kaydi.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            3. Kisisel Verilerin Islenme Amaclari
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Üyelik sureclerinin yurutulmesi ve hesap guvenliginin saglanmasi.</li>
            <li>
              Sipariş ve ödeme sureclerinin yonetilmesi, ürünun teslim edilmesi.
            </li>
            <li>Bayi basvurularinin degerlendirilmesi ve bayilik iliskisinin yurutulmesi.</li>
            <li>
              Mali ve muhasebesel yukumluluklerin (e-Fatura, e-Arsiv) yerine
              getirilmesi; vergi kanunlari ve Turk Ticaret Kanunu kapsaminda
              defter/belge saklama yukumlulugu.
            </li>
            <li>
              Tuketici sikayetlerinin alinmasi, iade ve cayma hakki sureclerinin
              yonetilmesi.
            </li>
            <li>
              Hukuki sureclerin yurutulmesi, yetkili kamu kurumlarina karsi
              yukumluluklerin yerine getirilmesi.
            </li>
            <li>
              Acik rizaniza dayali olarak ticari elektronik ileti gonderilmesi
              (kampanya, indirim, yenilik bildirimi).
            </li>
            <li>
              Bilgi guvenliginin saglanmasi, dolandiricilik ve kotuye kullanimin
              tespiti.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            4. Kisisel Verilerin Toplanma Yontemleri ve Hukuki Sebep
          </h2>
          <p>
            Kisisel verileriniz; Site üyelik formu, sipariş formlari, bayi
            basvuru formu, iletişim formu, e-posta, telefon ve çerezler/log
            kayıtlari gibi kanallar uzerinden, asagidaki hukuki sebeplere
            dayanilarak elektronik ortamda otomatik yollarla islenmektedir:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Bir sözleşmenin kurulmasi veya ifasiyla dogrudan ilgili olmasi
              (KVKK m.5/2-c).
            </li>
            <li>Veri sorumlusunun hukuki yukumlulugu (KVKK m.5/2-c).</li>
            <li>Bir hakkin tesisi, kullanilmasi veya korunmasi (KVKK m.5/2-e).</li>
            <li>
              Mesru menfaat — temel hak ve ozgurluklerinize zarar vermemek
              kaydiyla (KVKK m.5/2-f).
            </li>
            <li>
              Acik rizaniz (ticari elektronik ileti, opsiyonel çerezler — KVKK
              m.5/1).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            5. Kisisel Verilerin Aktarildigi Taraflar
          </h2>
          <p>
            Verileriniz; yasal yukumlulukler ve hizmetin gerekleri cercevesinde
            su taraflarla paylasilabilir:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Kargo firmalari</strong> (Aras, Yurtici, MNG, PTT vb.) —
              teslimat icin ad, adres ve telefon.
            </li>
            <li>
              <strong>Ödeme/banka kuruluslari</strong> ve 3D Secure saglayicilari
              — ödemenin tahsilati icin.
            </li>
            <li>
              <strong>e-Fatura/e-Arsiv saglayicisi</strong> (KolayBi) — fatura
              kesimi icin musteri ve sipariş bilgileri.
            </li>
            <li>
              <strong>Eposta servis saglayicisi</strong> (Resend) — bilgilendirme
              ve isleme dair email gonderimi.
            </li>
            <li>
              <strong>Hukuki danismanlik / mali musavirlik</strong> — yasal
              zorunluluklar dahilinde.
            </li>
            <li>
              <strong>Yetkili kamu kurum ve kuruluslari</strong> — yasal talep
              halinde (vergi, mahkeme, savcilik vb.).
            </li>
          </ul>
          <p className="mt-2">
            <strong>Yurt disina veri aktarimi:</strong> Hizmetlerimiz Turkiye
            uzerinden yurutulmektedir. Eposta ve barindirma altyapisi yurt
            disindaki saglayicilar uzerinden de calisabilir; bu durumda
            aktarimlar KVKK&apos;nin 9. maddesindeki guvenceler dahilinde
            yapilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            6. Kisisel Verilerin Saklanma Sureleri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Üyelik bilgileri</strong>: hesap silinene veya 3 yil
              hareketsizlik sonuna kadar.
            </li>
            <li>
              <strong>Sipariş ve fatura kayıtlari</strong>: 213 sayıli Vergi
              Usul Kanunu ve 6102 sayıli Turk Ticaret Kanunu uyarınca{" "}
              <strong>10 yil</strong>.
            </li>
            <li>
              <strong>Log kayıtlari</strong>: 5651 sayıli Internet Kanunu ve
              ilgili mevzuat uyarınca <strong>2 yil</strong>.
            </li>
            <li>
              <strong>Pazarlama izni</strong>: izin geri çekilene kadar.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            7. KVKK Madde 11 Kapsamindaki Haklariniz
          </h2>
          <p>
            Veri sahibi olarak Sirket&apos;e basvurarak asagidaki haklariniz
            kullanabilirsiniz:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Kisisel verinizin islenip islenmedigini ogrenme.</li>
            <li>Kisisel verileriniz islenmisse buna iliskin bilgi talep etme.</li>
            <li>
              Islenme amacini ve verilerin amacina uygun kullanilip
              kullanilmadigini ogrenme.
            </li>
            <li>
              Yurt icinde veya yurt disinda verilerin aktarildigi ucuncu
              kisileri bilme.
            </li>
            <li>
              Eksik veya yanlis islenmis ise duzeltilmesini isteme.
            </li>
            <li>
              KVKK 7. madde şartlari cercevesinde silinmesini veya yok
              edilmesini isteme.
            </li>
            <li>
              Otomatik sistemler vasitasiyla aleyhinize bir sonuc dogmasina
              itiraz etme.
            </li>
            <li>
              Kanuna aykiri islenme nedeniyle zarara ugramaniz halinde zararin
              giderilmesini talep etme.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">8. Basvuru Yontemi</h2>
          <p>
            KVKK m.13 uyarınca veri sahibi basvurusu yazili olarak veya guvenli
            elektronik posta yoluyla yapilabilir. En hızlı yol icin{" "}
            <Link
              href="/kvkk-basvuru"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              KVKK Basvuru Formu
            </Link>{" "}
            uzerinden basvurabilir veya{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresine kimliginizi tevsik edici belgelerle birlikte yazabilirsiniz.
            Talebiniz en gec <strong>30 gün</strong> icinde sonuclandirilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">9. Çerezler</h2>
          <p>
            Site&apos;de kullanilan çerezlere ve bunlari yonetme yontemlerine
            iliskin detayli bilgi icin{" "}
            <Link
              href="/cerez-politikasi"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Çerez Politikasi
            </Link>
            &apos;ni inceleyebilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}
