import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Uyelik Sozlesmesi",
  description:
    "Master Education uyelik sozlesmesi — uyelik kosullari, taraflarin hak ve yukumlulukleri.",
};

export default function MembershipAgreementPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Uyelik Sozlesmesi
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Son guncelleme: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <h2 className="text-xl font-display font-semibold">1. Taraflar</h2>
          <p>
            Isbu Uyelik Sozlesmesi (&quot;Sozlesme&quot;); bir tarafta{" "}
            <strong>{BRAND.name}</strong>{" "}
            (&quot;Sirket&quot;) ile diger tarafta{" "}
            <a
              href="https://mastereducation.com.tr"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              mastereducation.com.tr
            </a>{" "}
            adresinde uye olan kisi (&quot;Uye&quot;) arasinda elektronik
            ortamda akdedilmistir. Uye, kayit asamasinda Sozlesme&apos;yi
            okuyup onayladigini kabul eder.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">2. Sozlesmenin Konusu</h2>
          <p>
            Sozlesmenin konusu; Sirket tarafindan isletilen Site uzerinde Uye&apos;ye
            sunulan urun ve hizmetlerden yararlanma sartlari ile taraflarin hak ve
            yukumluluklerinin belirlenmesidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">3. Uye Olma Sartlari</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              18 yasini doldurmus, fiil ehliyetine sahip gercek kisi veya tuzel
              kisi temsilcisi olmak.
            </li>
            <li>
              Kayit formundaki bilgilerin dogru, guncel ve kendisine ait
              oldugunu beyan etmek.
            </li>
            <li>
              KVKK Aydinlatma Metni&apos;ni okudugunu ve Sozlesme&apos;yi kabul
              ettigini onaylamak.
            </li>
            <li>
              Daha onceden Sirket tarafindan uyeligi sonlandirilmis olmamak.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            4. Uyenin Hak ve Yukumlulukleri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Uye, hesabinin guvenliginden (sifre, email) bizzat sorumludur.
              Sifrenin baskalariyla paylasilmasi sonucu olusan zararlardan Uye
              sorumludur.
            </li>
            <li>
              Site uzerinden satin alinan urunler icin verilen iletisim ve
              teslimat bilgilerinin dogrulugundan Uye sorumludur.
            </li>
            <li>
              Uye, Site&apos;yi yasalara, kamu duzenine ve dürüstlük kurallarina
              uygun kullanmayi taahhüt eder. Aksi kullanim halinde Sirket
              uyeligi askiya alma veya sonlandirma hakkina sahiptir.
            </li>
            <li>
              Uye, Site uzerinden gerceklestirdigi siparislerin Mesafeli Satis
              Sozlesmesi&apos;ne tabi oldugunu ve siparis verirken bu sozlesmeyi
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
              ozen gosterir; ancak teknik sebepler veya bakim nedeniyle
              gecici kesintiler yasanabilir.
            </li>
            <li>
              Sirket, Sozlesme&apos;de yer alan tum hukumleri onceden haber
              vermeksizin tek tarafli olarak degistirme hakkini sakli tutar.
              Onemli degisikliklerde Uye email yoluyla bilgilendirilir.
            </li>
            <li>
              Sirket, Uye verilerini KVKK Aydinlatma Metni&apos;nde belirtilen
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
            Site uzerinde yer alan tum logo, gorsel, metin, yazilim ve veritabani
            Sirket veya Sirket&apos;in lisans aldigi ucuncu kisilere aittir.
            Izinsiz kopyalanmasi, cogaltilmasi veya ticari amacla kullanilmasi
            yasaktir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            7. Uyeligin Sonlanmasi
          </h2>
          <p>
            Uye diledigi zaman{" "}
            <Link
              href="/hesabim/hesabi-sil"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              Hesabim &rsaquo; Hesabi Sil
            </Link>{" "}
            sayfasi uzerinden uyeligini sonlandirabilir. Uyelik sonlandirilsa dahi
            yasal saklama sureleri (vergi mevzuati, ticari defter saklama vb.)
            cercevesinde bazi veriler anonimlestirilerek saklanir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            8. Uyusmazliklarin Cozumu
          </h2>
          <p>
            Sozlesme&apos;den dogan uyusmazliklarda Turkiye Cumhuriyeti
            kanunlari uygulanir. Tuketici hukuku kapsaminda Tuketici Hakem
            Heyetleri ve Tuketici Mahkemeleri yetkilidir; tacir/bayi siparisleri
            icin Sirket merkezinin bulundugu yer mahkemeleri ve icra daireleri
            yetkilidir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">9. Iletisim</h2>
          <p>
            Sozlesme ile ilgili her tur soru, basvuru ve bildirim icin{" "}
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
            Uye, Site&apos;ye kayit olarak yukaridaki tum maddeleri okudugunu,
            anladigini ve kabul ettigini beyan eder.
          </p>
        </section>
      </div>
    </div>
  );
}
