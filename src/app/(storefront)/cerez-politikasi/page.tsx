import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Çerez Politikasi",
  description:
    "Master Education web sitesinde kullanilan çerez (cookie) turleri, amaclari ve tercihleri yonetme yontemleri.",
};

export default function CookiePolicyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-display font-bold text-brand-black mb-2">
        Çerez Politikasi
      </h1>
      <p className="text-sm text-brand-muted mb-8">
        Son güncelleme: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
      </p>

      <div className="prose prose-sm max-w-none text-brand-black space-y-6">
        <section>
          <p>
            Bu Çerez Politikasi; {BRAND.name} (&quot;Sirket&quot;, &quot;biz&quot;)
            tarafindan isletilen{" "}
            <a
              href="https://mastereducation.com.tr"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              mastereducation.com.tr
            </a>{" "}
            (&quot;Site&quot;) uzerinde kullanilan çerezler ve benzer izleme
            teknolojileri hakkinda bilgi vermek; 6698 sayıli Kisisel Verilerin
            Korunmasi Kanunu (&quot;KVKK&quot;) ve Elektronik Haberlesme Kanunu
            kapsamindaki yukumluluklerimizi yerine getirmek amaciyla
            hazirlanmistir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            Çerez (Cookie) Nedir?
          </h2>
          <p>
            Çerezler, ziyaret ettiginiz web sitelerinin tarayicinizda sakladigi
            kucuk metin dosyalaridir. Sitenin temel islevlerinin calismasi,
            tercihlerinizin hatırlanmasi ve site kullanimini ölçulmesi icin
            kullanilirlar. Çerezler kisisel veri icerebilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            Kullandigimiz Çerez Turleri
          </h2>

          <h3 className="text-base font-display font-semibold mt-4">
            1. Zorunlu Çerezler (Strictly Necessary)
          </h3>
          <p>
            Sitenin temel islevlerini yerine getirmesi icin gereklidir. Oturum
            yönetimi, sepet icerigi, guvenlik dogrulamalari (CSRF tokeni) ve
            site icin tercihlerin (dil, oturum) saklanmasi bu kategoride yer
            alir. Bu çerezler <strong>acik riza gerektirmez</strong> ve
            kapatilmasi durumunda site duzgun calismaz.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <code>next-auth.session-token</code> — oturum yönetimi (HttpOnly)
            </li>
            <li>
              <code>next-auth.csrf-token</code> — CSRF saldirilarina karsi
              koruma
            </li>
            <li>
              <code>me_cookie_consent</code> — çerez tercihlerinin kendisi
            </li>
            <li>localStorage: sepet icerigi, favoriler, son gorulen ürünler</li>
          </ul>

          <h3 className="text-base font-display font-semibold mt-4">
            2. Performans / Analitik Çerezler
          </h3>
          <p>
            Sitenin nasil kullanildigini ölçer, sayfa görüntüleme istatistikleri
            tutariz. Bu veriler agregat olarak (kisisel olmayan) site
            performansini iyilestirmek icin kullanilir. Kabul etmediginiz
            takdirde bu çerezler yüklenmez.
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              Sayfa görüntüleme sayaci (kendi sunucumuzda;{" "}
              <code>page_views</code> tablosu)
            </li>
          </ul>

          <h3 className="text-base font-display font-semibold mt-4">
            3. Pazarlama / Hedefleme Çerezleri
          </h3>
          <p>
            Ziyaretcilere ilgi alanlarina uygun icerik veya reklam sunmak icin
            kullanilir. Kabul etmediginiz takdirde yüklenmez. Su anda 3.
            taraf reklam veya yeniden hedefleme çerezi kullanmiyoruz; ileride
            kullanildiginda bu liste güncellenir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            Çerez Tercihlerinizi Nasil Yonetirsiniz?
          </h2>
          <p>
            Sitemizde ilk ziyaretinizde gordugunuz çerez yönetim panelinden
            tercihlerinizi belirleyebilirsiniz. Tercihlerinizi sonradan
            degistirmek icin sayfanin alt kosesindeki{" "}
            <strong>Çerez Tercihleri</strong> linkine tiklamaniz yeterlidir.
          </p>
          <p>
            Ayrica tarayici ayarlarinizdan da çerezleri tamamen veya kismen
            engelleyebilirsiniz:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <a
                href="https://support.google.com/chrome/answer/95647"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold-dark font-medium hover:underline"
              >
                Google Chrome
              </a>
            </li>
            <li>
              <a
                href="https://support.mozilla.org/tr/kb/cerezleri-silme-web-sitelerinin-bilgilerini-kaldirma"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold-dark font-medium hover:underline"
              >
                Mozilla Firefox
              </a>
            </li>
            <li>
              <a
                href="https://support.apple.com/tr-tr/guide/safari/sfri11471/mac"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold-dark font-medium hover:underline"
              >
                Safari
              </a>
            </li>
            <li>
              <a
                href="https://support.microsoft.com/tr-tr/microsoft-edge"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-gold-dark font-medium hover:underline"
              >
                Microsoft Edge
              </a>
            </li>
          </ul>
          <p className="text-sm text-brand-muted">
            Not: Zorunlu çerezleri kapatmaniz halinde sitemizin bazi bolumleri
            (giriş yapma, sepet, ödeme) calismayabilir.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            Çerez Saklama Sureleri
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Oturum çerezleri</strong>: tarayici kapatildiginda silinir.
            </li>
            <li>
              <strong>Kalici çerezler</strong>: 30 gün ile 1 yil arasi (çerez
              turune göre).
            </li>
            <li>
              <strong>Çerez tercihleri</strong> (<code>me_cookie_consent</code>):
              12 ay sonra yenilenmeniz istenir.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold">
            İletişim ve Basvuru
          </h2>
          <p>
            Çerezler kanaliyla islenen kisisel verilerinize iliskin KVKK
            kapsamindaki haklarinizi kullanmak icin{" "}
            <Link
              href="/kvkk-basvuru"
              className="text-brand-gold-dark font-medium hover:underline"
            >
              KVKK Basvuru Formu
            </Link>{" "}
            uzerinden bize ulasabilirsiniz.
          </p>
          <p>
            Detayli bilgi icin{" "}
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
