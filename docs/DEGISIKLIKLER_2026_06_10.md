# Değişiklik Notu — 2026-06-10 Bütünsel Denetim & Düzeltmeler

> Bu dosya, gelecek seferde **ne yapıldığını tek tek kontrol etmen** için yazıldı.
> Her madde: ne sorundu → ne değişti → hangi dosya → nasıl test edersin.
>
> **Durum:** Tümü uygulandı. `npx tsc --noEmit` temiz · `npx vitest run` 163 test geçti
> (yalnız DB gerektiren `product-image-ordering` testi ortam yüzünden atlandı).
> **DB'ye dokunulmadı · şema değişikliği YOK · migration YOK · commit edilmedi.**

İlgili detay belgesi: `docs/QA_MANUAL_TEST_PLAN.md` (Bölüm E bulgular, Bölüm F çözümler).

---

## YENİ DOSYA

### `src/lib/order-side-effects.ts` (YENİ)
Sipariş **iptal** ve **reaktivasyon** yan etkilerinin tek kaynağı:
`applyOrderCancelSideEffects` ve `applyOrderReactivateSideEffects`.
İçerik: stok iadesi/düşümü + cari (ledger) + kupon `usedCount` + fatura durumu.
Neden: tekil ve toplu route'lar aynı mantığı kopyalamıştı ve diverge etmişti.

---

## DÜZELTMELER (dosya dosya)

### 1) `src/app/api/admin/orders/[id]/status/route.ts`
- **Önce:** iptal/reaktivasyon mantığı route içinde elle yazılıydı; iptalde kupon
  redemption **siliniyordu** → reaktivasyonda kupon geri gelmiyordu.
- **Sonra:** ortak helper'lara devredildi. Kupon redemption artık **silinmiyor**,
  yalnız `usedCount` azalıyor; reaktivasyonda geri artıyor.
- **Test:** Bir kuponlu sipariş oluştur → admin'den İptal et → Coupon.usedCount −1,
  CouponRedemption satırı duruyor, Invoice CANCELLED, stok iade. Sonra CANCELLED→PENDING
  reaktive et → usedCount +1, stok tekrar düştü.

### 2) `src/app/api/admin/orders/bulk-status/route.ts`
- **Önce:** toplu iptal yalnız stok+cari yapıyordu; **kupon ve fatura yan etkilerini
  atlıyordu** (tekil route yapıyordu).
- **Sonra:** aynı helper'ları çağırıyor + KolayBi'de kesilmiş fatura varsa muhasebeye
  iptal bildirimi (tekil route ile parite).
- **Test:** Toplu seçimle birden çok kuponlu/faturalı siparişi İptal et → her birinde
  kupon usedCount düştü, Invoice CANCELLED. (Eskiden olmuyordu.)

### 3) `src/lib/invoice-service.ts`
- **Önce:** `sendPendingInvoice` siparişin iptal olup olmadığına bakmıyordu →
  retry-cron iptal siparişin faturasını KolayBi'ye **gerçek kayıt** olarak gönderebiliyordu.
- **Sonra:** `order.status === "CANCELLED"` ise göndermez, faturayı CANCELLED'a çeker.
- **Test:** Faturası PENDING olan siparişi iptal et → cron/elle gönderim denemesi
  faturayı CANCELLED yapar, KolayBi'ye gitmez.

### 4) Ödeme-iptal yolları (3 dosya) — `payments/mock/confirm`, `payments/iyzico/callback`, `payments/iyzico/webhook`
- **Önce:** ödeme başarısız/iade olunca sipariş CANCELLED + stok iade ediliyordu ama
  faturaya dokunulmuyordu; ayrıca FAILURE+REFUND ardışık gelirse **stok 2 kez** iade
  edilebiliyordu.
- **Sonra:** üçü de ortak `applyOrderCancelSideEffects`'i çağırıyor (fatura iptal +
  kupon tutarlılığı) ve "sipariş zaten CANCELLED ise yan etki uygulama" guard'ı var.
- **Test:** (mock) 3DS'te yanlış OTP/iptal → sipariş iptal, stok 1 kez iade, fatura
  CANCELLED. Aynı siparişe ikinci iptal sinyali stok tekrar iade etmez.

### 5) `src/lib/order-delete.ts` + `orders/[id]/route.ts` + `orders/bulk-delete/route.ts` (D1)
- **Önce:** KolayBi'ye kesilmiş (SENT) faturalı sipariş bile kalıcı silinebiliyordu;
  hard-delete'te aktif siparişin kupon `usedCount`'u düşürülmüyordu.
- **Sonra:** SENT faturalı sipariş kalıcı silinemez → **409** "önce iptal edin"; aktif
  siparişin kuponu hard-delete'te düzeltiliyor.
- **Test:** SENT faturalı siparişi Kalıcı Sil → engellenir + net mesaj. Faturasız aktif
  kuponlu siparişi sil → usedCount düşer.

### 6) `src/app/api/orders/route.ts` (B5, B6, B7)
- **B5:** Sipariş onay maili artık **bayinin hesap e-postasına** gidiyor (checkout'ta
  yazılan serbest e-postaya değil).
- **B6:** Bayi siparişinde `couponCode` gönderilirse server **reddediyor** (B2B kupon
  istifleme kapandı; kupon kutusu zaten bayiye gizli).
- **B7:** `subtotal`/`discountTotal` 2 ondalığa **yuvarlanarak** saklanıyor (float drift
  giderildi).
- **Test:** Bayi siparişi ver → onay maili bayi e-postasında (DRYRUN console/EmailLog).
  Elle couponCode'lu istek → 400. DB'de subtotal/total ondalıkları temiz.

### 7) `src/app/api/payments/iyzico/init/route.ts` (B8)
- **Önce:** oturum yoksa orderId bilen herkes ödeme başlatabiliyordu (misafir yolu).
- **Sonra:** dealer-only → oturum + sahiplik zorunlu (aksi 403).

### 8) Fiyat sızıntısı — `api/search`, `api/products/[id]`, `api/cart/refresh`, `components/layout/search-combobox.tsx` (B3)
- **Önce:** UI fiyatı gizlese de JSON ham fiyat döndürüyordu (oturumsuz dahil).
- **Sonra:** `search` fiyatı hiç döndürmüyor; `products/[id]` fiyatı **yalnız admin**;
  `cart/refresh` fiyatı **yalnız onaylı bayi** (public'e 0). `dealerPrice` korunur.
- **Test:** Oturumsuz `/api/search?q=...` ve `/api/products/<id>` yanıtında `price` yok/null.
  Bayi girişinde cart/refresh fiyatı gelir.

### 9) `src/lib/validations.ts` (B10, B11)
- **B10:** `discountRuleSchema` artık scope'a uymayan FK'leri null'lar (örn. GLOBAL +
  productId tutarsızlığı engellendi).
- **B11:** Admin bayi oluşturmada **adres girilirse** il/ilçe geçerlilik doğrulaması.

### 10) `api/admin/products/route.ts` + `[id]/route.ts` (B12)
- Ürün **create ve update**'te SKU/ISBN tekrarı varsa **409** (eskiden yalnız bulk-import
  kontrol ediyordu; @unique eklenmedi çünkü eski veride mükerrer olabilir).
- **Test:** Var olan SKU ile yeni ürün / düzenleme → 409 net mesaj.

### 11) Admin bayi firma alanları UI (D5) — `components/admin/dealer-actions.tsx` + `admin/bayiler/[id]/page.tsx`
- Admin bayi detayında firma adı / vergi dairesi / vergi no / sicil / yetkili artık
  **düzenlenebiliyor** ("Bilgileri Kaydet"). API zaten destekliyordu, UI eksikti.

### 12) Admin sipariş detayı (D2) — `admin/siparisler/[id]/page.tsx`
- Açık hesap siparişlerde "**Ödeme cari hesaptan takip edilir (ekstre)**" rozeti.
  (paymentStatus alanına dokunulmadı — karar gereği.)

---

## YAPILMAYANLAR (bilinçli)
- **B9 (ürün formu null alan):** yanlış pozitif — Zod zaten dostça "X zorunludur." veriyor.
- **D4 (nameEn kolonu kaldırma):** **İPTAL** — nameEn ölü değil; `urunler/[slug]` detayda
  "İngilizce Adı" gösteriyor, arama + bulk-import kullanıyor. Kaldırmak regresyon olurdu.
- **Soft-delete'in tamamı (D1 tam):** sadece minimal güvenlik (SENT fatura koruması) yapıldı.

## AÇIK / SONRAKİ
- Neon **dev** DB'de `20260607000000_p2_orderitem_review_indexes` migration'ı hâlâ
  UYGULANMAMIŞ (yalnız index; drift). İstenirse onayınla `migrate deploy`.
- Bu değişiklikler **commit edilmedi** (proje git deposu değil).
