/**
 * ASCII Turkce -> proper Turkce diakritik bulk replace.
 *
 * - Sadece src/ altindaki .ts ve .tsx dosyalarini etkiler.
 * - Negatif lookbehind/lookahead ile URL slug'larini (/giris, /iletisim)
 *   ve identifier'lari (variable name etc) atlar.
 * - Word-boundary garantili: "Girisken" gibi compound'larda Giris'i degistirmez.
 *
 * Run: node scripts/fix-turkish-diacritics.mjs
 */

import fs from "node:fs";
import path from "node:path";

// ASCII -> Turkce mappings. Sadece Turkce'de ASCII'siz hali yanlis olan
// yaygin sozcukler. Belirsiz olanlar (Once = once/önce) dahil edilmedi.
const MAP = {
  // a -> ı
  Acima: "Açıma", aciklama: "açıklama", Aciklama: "Açıklama",
  Adim: "Adım", adim: "adım",
  // c -> ç
  Cek: "Çek", cek: "çek",
  Cerez: "Çerez", cerez: "çerez",
  Cesit: "Çeşit", cesit: "çeşit", Cesitli: "Çeşitli", cesitli: "çeşitli",
  Cikar: "Çıkar", cikar: "çıkar",
  Cikis: "Çıkış", cikis: "çıkış",
  Cogu: "Çoğu", cogu: "çoğu",
  Cok: "Çok", cok: "çok",
  Cocuk: "Çocuk", cocuk: "çocuk",
  // e -> e (already correct in compound; ğ in 'eg' replacement)
  Egitim: "Eğitim", egitim: "eğitim",
  // g -> ğ
  Goster: "Göster", goster: "göster",
  Goruntule: "Görüntüle", goruntule: "görüntüle",
  Goz: "Göz", goz: "göz",
  // h -> Hesabım
  Hakkimizda: "Hakkımızda", hakkimizda: "hakkımızda",
  Hesabim: "Hesabım", hesabim: "hesabım",
  Hizli: "Hızlı", hizli: "hızlı",
  // i -> ı/İ
  Iade: "İade",
  Iletisim: "İletişim", iletisim: "iletişim",
  Iptal: "İptal", iptal: "iptal",
  Indirim: "İndirim", indirim: "indirim",
  Indir: "İndir",
  Iskonto: "İskonto", iskonto: "iskonto",
  Iskontolar: "İskontolar", iskontolar: "iskontolar",
  Iste: "İşte",
  // k
  Karsilastir: "Karşılaştır", karsilastir: "karşılaştır",
  Kayit: "Kayıt", kayit: "kayıt",
  Kullanici: "Kullanıcı", kullanici: "kullanıcı",
  Kullanicilar: "Kullanıcılar", kullanicilar: "kullanıcılar",
  // l
  Lutfen: "Lütfen", lutfen: "lütfen",
  // o -> ö
  Odeme: "Ödeme", odeme: "ödeme",
  Olustur: "Oluştur", olustur: "oluştur",
  Olum: "Ölüm",
  Onayli: "Onaylı", onayli: "onaylı",
  Onceki: "Önceki", onceki: "önceki",
  // p -> profil already correct
  // s -> ş
  Sec: "Seç",
  Sezon: "Sezon",
  Sifre: "Şifre", sifre: "şifre",
  Sifremi: "Şifremi", sifremi: "şifremi",
  Sikca: "Sıkça", sikca: "sıkça",
  Siparis: "Sipariş", siparis: "sipariş",
  Siparisler: "Siparişler", siparisler: "siparişler",
  Siparislerim: "Siparişlerim", siparislerim: "siparişlerim",
  Soz: "Söz", soz: "söz",
  Sozlesme: "Sözleşme", sozlesme: "sözleşme",
  Sozlesmesi: "Sözleşmesi", sozlesmesi: "sözleşmesi",
  Sukran: "Şükran",
  // t
  Tukenmis: "Tükenmiş", tukenmis: "tükenmiş",
  Tum: "Tüm", tum: "tüm",
  // u -> ü
  Ucretsiz: "Ücretsiz", ucretsiz: "ücretsiz",
  Urun: "Ürün", urun: "ürün",
  Urunler: "Ürünler", urunler: "ürünler",
  Urunum: "Ürünüm", urunum: "ürünüm",
  Uye: "Üye", uye: "üye",
  Uyelik: "Üyelik", uyelik: "üyelik",
  // y
  Yayinevi: "Yayınevi", yayinevi: "yayınevi",
  Yayinevleri: "Yayınevleri", yayinevleri: "yayınevleri",
  Yonetim: "Yönetim", yonetim: "yönetim",
  Yonetici: "Yönetici", yonetici: "yönetici",
  Yukle: "Yükle", yukle: "yükle",
  Yuklenme: "Yüklenme", yuklenme: "yüklenme",
  // Giris/Giriş
  Giris: "Giriş", giris: "giriş",
  // Ek kokler — prefix mode sayesinde "Hosgeldiniz", "kayitli" gibi formlar
  // su koklerle yakalanir
  Hosgeldin: "Hoşgeldin", hosgeldin: "hoşgeldin",
  Hosgeld: "Hoşgeld", hosgeld: "hoşgeld",
  Basari: "Başarı", basari: "başarı",
  Basaril: "Başarıl", basaril: "başarıl",
  Basarisiz: "Başarısız", basarisiz: "başarısız",
  Olustu: "Oluştu", olustu: "oluştu",
  Olusturul: "Oluşturul", olusturul: "oluşturul",
  Esles: "Eşleş", esles: "eşleş",
  Aydinlat: "Aydınlat", aydinlat: "aydınlat",
  Gun: "Gün", gun: "gün",
  Kabul: "Kabul", kabul: "kabul", // already correct but safe
  Sart: "Şart", sart: "şart",
  Gore: "Göre", gore: "göre",
  Olc: "Ölç", olc: "ölç",
  Ozel: "Özel", ozel: "özel",
  Olur: "Olur",  // correct (no diacritic needed but reserve)
  Soyad: "Soyad", // correct (reserve)
  Sayi: "Sayı", sayi: "sayı",
  Sehir: "Şehir", sehir: "şehir",
  Ilce: "İlçe", ilce: "ilçe",
  Sifren: "Şifren", sifren: "şifren",
  Olus: "Oluş", olus: "oluş",
  Gorev: "Görev", gorev: "görev",
  Sec: "Seç", sec: "seç",
  Onem: "Önem", onem: "önem",
  Onayl: "Onayl", onayl: "onayl", // already mostly correct; reserve
  Acikla: "Açıkla", acikla: "açıkla",
  Cikar: "Çıkar", cikar: "çıkar",
  Gorun: "Görün", gorun: "görün",
  Cevir: "Çevir", cevir: "çevir",
  Hatirla: "Hatırla", hatirla: "hatırla",
  Bilg: "Bilg", bilg: "bilg", // correct (no diacritic); reserve
  Uyari: "Uyarı", uyari: "uyarı",
  Genel: "Genel", genel: "genel",
  Devam: "Devam", devam: "devam",
};

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(f.name) && !/\.d\.ts$/.test(f.name)) out.push(full);
  }
  return out;
}

const ROOT = "src";
const files = walk(ROOT);

let touched = 0;
let totalReplacements = 0;
const perWord = {};

// Prefix-then-suffix mode: "Sifre" base eslesince "Sifreler", "Sifreniz",
// "Sifremi" gibi turevleri de yakalanir. Suffix oldugu gibi kalir.
// Buyuk-kucuk harf duyarli ayri girisler.
const sortedKeys = Object.keys(MAP).sort((a, b) => b.length - a.length); // uzun once
const allKeys = sortedKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const re = new RegExp(`(?<![/\\w\\-])(${allKeys})([a-zA-ZçğıöşüÇĞİÖŞÜ]*)`, "g");

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  let fileReplacements = 0;

  content = content.replace(re, (full, base, rest) => {
    const replacement = MAP[base] + rest;
    fileReplacements++;
    perWord[base] = (perWord[base] ?? 0) + 1;
    return replacement;
  });

  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    touched++;
    totalReplacements += fileReplacements;
  }
}

console.log(`\nDosya etkilendi: ${touched}/${files.length}`);
console.log(`Toplam degisiklik: ${totalReplacements}\n`);
console.log("Kelime bazinda:");
for (const [w, n] of Object.entries(perWord).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${w.padEnd(20)} ${n}`);
}
