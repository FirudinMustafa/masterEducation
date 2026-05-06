#!/usr/bin/env bash
# Production smoke test — master-education-ten.vercel.app
# 50+ endpoint, gercek HTTP statuslerini raporlar.
set +e
BASE="${BASE:-https://master-education-ten.vercel.app}"
PASS=0
FAIL=0
TOTAL=0

probe() {
  local method="$1" path="$2" expect="$3" label="$4"
  TOTAL=$((TOTAL+1))
  local code
  if [ "$method" = "POST" ]; then
    code=$(curl -s -o /dev/null --max-time 15 -X POST -H "Content-Type: application/json" -d '{}' -w "%{http_code}" "$BASE$path")
  else
    code=$(curl -s -o /dev/null --max-time 15 -L -w "%{http_code}" "$BASE$path")
  fi
  if [[ ",$expect," == *",$code,"* ]]; then
    PASS=$((PASS+1))
    printf "  ✓ %-3s %-50s %s [beklenen: %s]\n" "$code" "$path" "$label" "$expect"
  else
    FAIL=$((FAIL+1))
    printf "  ✗ %-3s %-50s %s [beklenen: %s]\n" "$code" "$path" "$label" "$expect"
  fi
}

echo "=== STOREFRONT ==="
probe GET "/" "200" "anasayfa"
probe GET "/urunler" "200" "urun listesi"
probe GET "/urunler?q=kitap" "200" "arama sonucu"
probe GET "/kategoriler" "200" "kategoriler liste"
probe GET "/yayinevleri" "200" "yayinevleri liste"
probe GET "/karsilastir" "200" "karsilastir"
probe GET "/favoriler" "200,307" "favoriler (auth)"
probe GET "/sepet" "200" "sepet"
probe GET "/odeme" "200,307" "odeme (auth)"
probe GET "/siparis-takip" "200" "siparis-takip"
probe GET "/bayi-basvuru" "200" "bayi basvuru formu"
probe GET "/iletisim" "200" "iletisim"
probe GET "/hakkimizda" "200" "hakkimizda"
probe GET "/sss" "200" "sss"
probe GET "/iade" "200" "iade"
probe GET "/cerez-politikasi" "200" "cerez"
probe GET "/kvkk" "200" "kvkk"
probe GET "/kvkk-basvuru" "200" "kvkk basvuru"
probe GET "/mesafeli-satis-sozlesmesi" "200" "msm sozlesme"
probe GET "/on-bilgilendirme-formu" "200" "on bilgilendirme"
probe GET "/uyelik-sozlesmesi" "200" "uyelik sozlesme"

echo ""
echo "=== AUTH SAYFALARI ==="
probe GET "/giris" "200" "giris"
probe GET "/kayit" "200" "kayit"
probe GET "/sifremi-unuttum" "200" "sifremi unuttum"
probe GET "/sifre-sifirla" "200,307,308,400,404" "sifre sifirla (token yok)"
probe GET "/email-dogrula" "200,307,308,400" "email dogrula (token yok)"
probe GET "/hesabim" "307" "hesabim (auth gate)"
probe GET "/hesabim/profil" "307" "profil (auth gate)"
probe GET "/hesabim/siparislerim" "307" "siparislerim (auth gate)"

echo ""
echo "=== ADMIN GATE ==="
probe GET "/admin" "307" "admin redirect"
probe GET "/yonetim" "200" "yonetim giris"
probe GET "/admin/urunler" "307" "admin urunler (auth)"
probe GET "/admin/siparisler" "307" "admin siparisler (auth)"
probe GET "/admin/bayiler" "307" "admin bayiler (auth)"
probe GET "/bayi" "307" "bayi panel (auth)"

echo ""
echo "=== API ENDPOINTLER ==="
probe GET "/api/health" "200" "health"
probe GET "/api/products" "200" "products list"
probe GET "/api/search?q=ingilizce" "200" "search api"
probe POST "/api/auth/forgot-password" "200,400,429" "forgot-password"
probe POST "/api/auth/register" "201,400,422,429" "register (empty body)"
probe POST "/api/orders" "401,403,400,422" "orders POST (auth required)"
probe GET "/api/admin/products" "401,403,307" "admin products (auth)"
probe GET "/api/dealer/me" "401,403,307" "dealer me (auth)"
probe POST "/api/contact" "200,400,422,429" "contact form"
probe POST "/api/coupons/validate" "200,400,422,429" "coupon validate"
probe POST "/api/cart/refresh" "200,401,400" "cart refresh"
probe GET "/api/cron/cleanup-payment-sessions" "401,503" "cron auth gated"
probe POST "/api/payments/mock/confirm" "401,400,403,404,422" "mock payment (env-gated)"
probe POST "/api/kvkk-basvuru" "200,400,422,429" "kvkk basvuru"

echo ""
echo "=== STATIK ASSET ==="
probe GET "/me-logo-v2.png" "200" "logo png"
probe GET "/robots.txt" "200" "robots"
probe GET "/sitemap.xml" "200" "sitemap"
probe GET "/favicon.ico" "200" "favicon"

echo ""
echo "=== 404 KONTROLU ==="
probe GET "/bu-sayfa-yok-12345" "404,200" "404"
probe GET "/api/yok-endpoint-12345" "404" "404 api"

echo ""
echo "=========================================="
printf "Toplam: %s · Basarili: %s · Hata: %s\n" "$TOTAL" "$PASS" "$FAIL"
echo "=========================================="
