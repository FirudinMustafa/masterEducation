import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Üyelik Sözleşmesi",
  description:
    "Master Education üyelik sözleşmesi — üyelik kosullari, taraflarin hak ve yukumlulukleri.",
};

export default function MembershipAgreementPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Üyelik Sözleşmesi
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Son güncelleme: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Taraflar</h2>
          <p>
            Isbu Üyelik Sözleşmesi (&quot;Sözleşme&quot;); bir tarafta{" "}
            <strong>{BRAND.name}</strong>{" "}
            (&quot;Sirket&quot;) ile diger tarafta{" "}
            <a
              href="https://mastereducation.com.tr"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              mastereducation.com.tr
            </a>{" "}
            adresinde üye olan kisi (&quot;Üye&quot;) arasinda elektronik
            ortamda akdedilmistir. Üye, kayıt asamasinda Sözleşme&apos;yi
            okuyup onayladigini kabul eder.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">2. Sözleşmenin Konusu</h2>
          <p>
            Sözleşmenin konusu; Sirket tarafindan isletilen Site uzerinde Üye&apos;ye
            sunulan ürün ve hizmetlerden yararlanma şartlari ile taraflarin hak ve
            yukumluluklerinin belirlenmesidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">3. Üye Olma Şartlari</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              18 yasini doldurmus, fiil ehliyetine sahip gercek kisi veya tuzel
              kisi temsilcisi olmak.
            </li>
            <li>
              Kayıt formundaki bilgilerin dogru, güncel ve kendisine ait
              oldugunu beyan etmek.
            </li>
            <li>
              KVKK Aydınlatma Metni&apos;ni okudugunu ve Sözleşme&apos;yi kabul
              ettigini onaylamak.
            </li>
            <li>
              Daha onceden Sirket tarafindan üyeligi sonlandirilmis olmamak.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            4. Üyenin Hak ve Yukumlulukleri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Üye, hesabinin guvenliginden (şifre, email) bizzat sorumludur.
              Şifrenin baskalariyla paylasilmasi sonucu oluşan zararlardan Üye
              sorumludur.
            </li>
            <li>
              Site uzerinden satin alinan ürünler icin verilen iletişim ve
              teslimat bilgilerinin dogrulugundan Üye sorumludur.
            </li>
            <li>
              Üye, Site&apos;yi yasalara, kamu duzenine ve dürüstlük kurallarina
              uygun kullanmayi taahhüt eder. Aksi kullanim halinde Sirket
              üyeligi askiya alma veya sonlandirma hakkina sahiptir.
            </li>
            <li>
              Üye, Site uzerinden gerceklestirdigi siparişlerin Mesafeli Satis
              Sözleşmesi&apos;ne tabi oldugunu ve sipariş verirken bu sözleşmeyi
              ayrica onayladigini kabul eder.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            5. Sirketin Hak ve Yukumlulukleri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Sirket, Site&apos;de sundugu hizmetin surekliligini saglamaya
              ozen gösterir; ancak teknik sebepler veya bakim nedeniyle
              gecici kesintiler yasanabilir.
            </li>
            <li>
              Sirket, Sözleşme&apos;de yer alan tüm hukumleri onceden haber
              vermeksizin tek tarafli olarak degistirme hakkini sakli tutar.
              Önemli degisikliklerde Üye email yoluyla bilgilendirilir.
            </li>
            <li>
              Sirket, Üye verilerini KVKK Aydınlatma Metni&apos;nde belirtilen
              amac ve sinirlar dahilinde isler.
            </li>
            <li>
              Sirket, sahtelik, dolandiricilik veya yasadisi kullanim sezdigi
              hesaplari onceden haber vermeden askiya alabilir veya
              sonlandirabilir.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            6. Fikri Mulkiyet Haklari
          </h2>
          <p>
            Site uzerinde yer alan tüm logo, gorsel, metin, yazilim ve veritabani
            Sirket veya Sirket&apos;in lisans aldigi ucuncu kisilere aittir.
            Izinsiz kopyalanmasi, cogaltilmasi veya ticari amacla kullanilmasi
            yasaktir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            7. Üyeligin Sonlanmasi
          </h2>
          <p>
            Üye diledigi zaman{" "}
            <Link
              href="/hesabim/hesabi-sil"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Hesabım &rsaquo; Hesabi Sil
            </Link>{" "}
            sayfasi uzerinden üyeligini sonlandirabilir. Üyelik sonlandirilsa dahi
            yasal saklama sureleri (vergi mevzuati, ticari defter saklama vb.)
            cercevesinde bazi veriler anonimlestirilerek saklanir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            8. Uyusmazliklarin Cozumu
          </h2>
          <p>
            Sözleşme&apos;den dogan uyusmazliklarda Turkiye Cumhuriyeti
            kanunlari uygulanir. Tuketici hukuku kapsaminda Tuketici Hakem
            Heyetleri ve Tuketici Mahkemeleri yetkilidir; tacir/bayi siparişleri
            icin Sirket merkezinin bulundugu yer mahkemeleri ve icra daireleri
            yetkilidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">9. İletişim</h2>
          <p>
            Sözleşme ile ilgili her tur soru, basvuru ve bildirim icin{" "}
            <a
              href={`mailto:${BRAND.email}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.email}
            </a>{" "}
            adresinden veya{" "}
            <a
              href={`tel:${BRAND.phone.replace(/\s/g, "")}`}
              className="text-brand-gold-dark font-medium hover:underline"
            >
              {BRAND.phone}
            </a>{" "}
            telefon numarasi uzerinden bize ulasabilirsiniz.
          </p>
        </section>

        <section className="border-t border-gray-200 pt-6 text-sm text-brand-muted">
          <p>
            Üye, Site&apos;ye kayıt olarak yukaridaki tüm maddeleri okudugunu,
            anladigini ve kabul ettigini beyan eder.
          </p>
        </section>
      </div>
    </div>
  );
}
