import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "KVKK Aydinlatma Metni",
  description:
    "Master Education kisisel verilerin korunmasi kanunu (KVKK) aydinlatma metni — veri sorumlusu, isleme amaclari, aktarim ve haklariniz.",
};

export default function KvkkPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        KVKK Aydinlatma Metni
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        6698 sayili Kisisel Verilerin Korunmasi Kanunu kapsaminda hazirlanmistir.{" "}
        Son guncelleme:{" "}
        {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Veri Sorumlusu</h2>
          <p>
            <strong>{BRAND.name}</strong> (&quot;Sirket&quot;), 6698 sayili
            Kisisel Verilerin Korunmasi Kanunu (&quot;KVKK&quot;) kapsaminda{" "}
            <strong>veri sorumlusu</strong> sifatiyla hareket etmektedir.
            Iletisim bilgileri:
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
              <strong>Iletisim bilgileri</strong>: e-posta adresi, telefon
              numarasi, posta adresi, il/ilce.
            </li>
            <li>
              <strong>Musteri islem bilgileri</strong>: siparis gecmisi, sepet
              icerigi, fatura bilgileri, urun degerlendirmeleri.
            </li>
            <li>
              <strong>Bayilik bilgileri</strong>: firma unvani, vergi dairesi,
              vergi numarasi, ticaret sicil bilgileri, imza sirkuleri/vergi
              levhasi gibi belgeler.
            </li>
            <li>
              <strong>Odeme bilgileri</strong>: kart sahibi adi, kartin son 4
              hanesi, marka (kart numarasinin tamami saklanmaz).
            </li>
            <li>
              <strong>Islem guvenligi bilgileri</strong>: IP adresi, oturum
              kayitlari, tarayici/cihaz bilgisi, log kayitlari.
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
            <li>Uyelik sureclerinin yurutulmesi ve hesap guvenliginin saglanmasi.</li>
            <li>
              Siparis ve odeme sureclerinin yonetilmesi, urunun teslim edilmesi.
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
            Kisisel verileriniz; Site uyelik formu, siparis formlari, bayi
            basvuru formu, iletisim formu, e-posta, telefon ve cerezler/log
            kayitlari gibi kanallar uzerinden, asagidaki hukuki sebeplere
            dayanilarak elektronik ortamda otomatik yollarla islenmektedir:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Bir sozlesmenin kurulmasi veya ifasiyla dogrudan ilgili olmasi
              (KVKK m.5/2-c).
            </li>
            <li>Veri sorumlusunun hukuki yukumlulugu (KVKK m.5/2-c).</li>
            <li>Bir hakkin tesisi, kullanilmasi veya korunmasi (KVKK m.5/2-e).</li>
            <li>
              Mesru menfaat — temel hak ve ozgurluklerinize zarar vermemek
              kaydiyla (KVKK m.5/2-f).
            </li>
            <li>
              Acik rizaniz (ticari elektronik ileti, opsiyonel cerezler — KVKK
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
              <strong>Odeme/banka kuruluslari</strong> ve 3D Secure saglayicilari
              — odemenin tahsilati icin.
            </li>
            <li>
              <strong>e-Fatura/e-Arsiv saglayicisi</strong> (KolayBi) — fatura
              kesimi icin musteri ve siparis bilgileri.
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
              <strong>Uyelik bilgileri</strong>: hesap silinene veya 3 yil
              hareketsizlik sonuna kadar.
            </li>
            <li>
              <strong>Siparis ve fatura kayitlari</strong>: 213 sayili Vergi
              Usul Kanunu ve 6102 sayili Turk Ticaret Kanunu uyarinca{" "}
              <strong>10 yil</strong>.
            </li>
            <li>
              <strong>Log kayitlari</strong>: 5651 sayili Internet Kanunu ve
              ilgili mevzuat uyarinca <strong>2 yil</strong>.
            </li>
            <li>
              <strong>Pazarlama izni</strong>: izin geri cekilene kadar.
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
              KVKK 7. madde sartlari cercevesinde silinmesini veya yok
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
            KVKK m.13 uyarinca veri sahibi basvurusu yazili olarak veya guvenli
            elektronik posta yoluyla yapilabilir. En hizli yol icin{" "}
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
            Talebiniz en gec <strong>30 gun</strong> icinde sonuclandirilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">9. Cerezler</h2>
          <p>
            Site&apos;de kullanilan cerezlere ve bunlari yonetme yontemlerine
            iliskin detayli bilgi icin{" "}
            <Link
              href="/cerez-politikasi"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Cerez Politikasi
            </Link>
            &apos;ni inceleyebilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}
