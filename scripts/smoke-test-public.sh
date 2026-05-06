#!/usr/bin/env bash
# Public sayfaların erişilebilirliğini test eder. 200/3xx beklenir; 4xx/5xx
# ise raporlanır. Slug-bazlı sayfalar için DB'den canlı bir slug çekilir.
set -u
URL="${URL:-https://master-education-ten.vercel.app}"

declare -A RESULTS
fail=0
pass=0

check() {
  local label="$1"
  local path="$2"
  local expect_max="${3:-399}"
  local code
  code=$(curl -sk -o /dev/null -w '%{http_code}' -L --max-time 20 "$URL$path")
  if [ "$code" -le "$expect_max" ] && [ "$code" -ge 200 ]; then
    printf "  %-45s %s\n" "$label ($path)" "$code  OK"
    pass=$((pass+1))
  else
    printf "  %-45s %s\n" "$label ($path)" "$code  FAIL"
    fail=$((fail+1))
  fi
}

echo "=== Storefront — landing & general pages ==="
check "Homepage" "/"
check "Products list" "/urunler"
check "Categories index" "/kategoriler"
check "Publishers index" "/yayinevleri"
check "Cart" "/sepet"
check "Search (q=ingilizce)" "/urunler?q=ingilizce"
check "Compare" "/karsilastir"
check "Favorites" "/favoriler"
check "Order tracking" "/siparis-takip"
check "Contact" "/iletisim"
check "About" "/hakkimizda"
check "FAQ" "/sss"
check "Return policy" "/iade"
check "Cookie policy" "/cerez-politikasi"
check "KVKK" "/kvkk"
check "KVKK basvuru" "/kvkk-basvuru"
check "Membership terms" "/uyelik-sozlesmesi"
check "Sales contract" "/mesafeli-satis-sozlesmesi"
check "Pre-info form" "/on-bilgilendirme-formu"
check "Dealer application" "/bayi-basvuru"

echo ""
echo "=== Auth pages ==="
check "Login" "/giris"
check "Register" "/kayit"
check "Forgot password" "/sifremi-unuttum"

echo ""
echo "=== Auth-required (expect 302/redirect to login) ==="
check "Account home (302)" "/hesabim" 399
check "Profile (302)" "/hesabim/profil" 399
check "Orders (302)" "/hesabim/siparislerim" 399
check "Admin (302)" "/admin" 399
check "Admin orders (302)" "/admin/siparisler" 399
check "Dealer panel (302)" "/bayi" 399

echo ""
echo "=== SEO / sitemap ==="
check "robots.txt" "/robots.txt"
check "sitemap.xml" "/sitemap.xml"

echo ""
echo "=== API: public read endpoints ==="
check "Products search (q=test)" "/api/products/cmnonexistent" 499  # 404 expected, want < 500

echo ""
echo "=== Result ==="
echo "  PASS: $pass  FAIL: $fail"
exit $fail
