# Master Education — Bütünsel Manuel Test Planı + Bulgular

> Amaç: Projeyi **localde çalıştırıp** her rolün (ADMIN, BAYI, herkese açık katalog) tüm arayüzünü
> gerçekten kullanarak; tüm CRUD'ları ve bu CRUD'lar sırasında **ilişkilerin** (stok, cari/ledger,
> kupon, fatura, OrderEvent) doğru tetiklendiğini ve **front ↔ backend uyumsuzluğu** olmadığını
> objektif olarak doğrulamak.
>
> Kullanım: Her senaryoyu tarayıcıda tıkla-doğrula yap. **Durum** kolonunu `✅ / ❌ / ⏭️` ile
> doldur; ❌ olanlar Bölüm E'ye not düşülür ve soru-cevap düzeltme döngüsüne girer.
> İlişki doğrulamalarını `npx prisma studio` ile ilgili tablodan teyit et.

Son güncelleme: 2026-06-10 · Next.js 16.2.3 · Prisma 7 · PostgreSQL

---

## 0. Önkoşullar (local kurulum)

Dizin: `master-education/`

| # | Adım | Komut / Yer | Durum |
|---|------|-------------|-------|
| 0.1 | Bağımlılıklar | `npm install` | ☐ |
| 0.2 | Prisma client | otomatik (`postinstall`) veya `npx prisma generate` | ☐ |
| 0.3 | Migration durumu / drift kontrolü | `npx prisma migrate status` | ☐ |
| 0.4 | (Gerekirse) migration uygula | `npx prisma migrate deploy` | ☐ |
| 0.5 | (Opsiyonel) ürün verisi | `npm run seed` | ☐ |
| 0.6 | Dev sunucu | `npm run dev` → http://localhost:3000 | ☐ |
| 0.7 | `.env` dev anahtarları | `ENABLE_MOCK_PAYMENTS=true` (3DS OTP=123456); mail/KolayBi boş = DRYRUN | ☐ |
| 0.8 | Admin giriş | `/yonetim` → `admin@mastereducation.com.tr` (parola seed çıktısı / `SEED_ADMIN_PASSWORD`) | ☐ |
| 0.9 | Test verisi: 1 OPEN_ACCOUNT + 1 PREPAID bayi | ADMIN → `/admin/bayiler/yeni` | ☐ |
| 0.10 | Test verisi: 1 kategori, 1 yayınevi, birkaç ürün (stoklu), 1 kupon, bayiye 1 iskonto | ADMIN panelleri | ☐ |

Roller ve giriş noktaları:
- **Herkese açık katalog:** oturumsuz, `/`
- **BAYI:** `/giris` → `/bayi`
- **ADMIN:** `/yonetim` → `/admin`

---

## A. Herkese Açık Katalog (oturumsuz)

| # | Senaryo / Adım | Beklenen sonuç | İlişki / kontrol | Durum |
|---|----------------|----------------|------------------|-------|
| A1 | Ana sayfa `/` açılır | Sayfa hatasız, ürün/kategori vitrini gelir | — | ☐ |
| A2 | `/urunler` listesi | Ürünler listelenir, sayfalama çalışır | — | ☐ |
| A3 | Filtreler: kategori / yayınevi / dil / tür / stok / indirim | Her filtre doğru sonucu daraltır, URL query güncellenir | — | ☐ |
| A4 | `/urunler/[slug]` ürün detay | Görsel, açıklama, stok durumu görünür | — | ☐ |
| A5 | **Fiyat gizleme** | Hiçbir kartta/detayda/sepette **fiyat yok** | `PriceDisplay → null` | ☐ |
| A6 | `/kategoriler` ve `/kategoriler/[slug]` | Kategori ağacı + ürünleri | — | ☐ |
| A7 | `/yayinevleri` ve `/yayinevleri/[slug]` | Yayınevi + ürünleri | — | ☐ |
| A8 | Arama (`/api/search` / arama kutusu) | İsim/SKU ile eşleşen sonuçlar | — | ☐ |
| A9 | Sepete ekle (oturumsuz) → `/odeme` | `/giris?callbackUrl=/odeme`'ye yönlendirme | bayi-only kapı | ☐ |
| A10 | Bilgi sayfaları: hakkımızda, sss, iletişim, kvkk, üyelik sözleşmesi | Hepsi açılır | — | ☐ |
| A11 | `/bayi-basvuru` formu doldur-gönder | Başvuru kaydı + doğrulama maili (DRYRUN console) | User(DEALER,PENDING)+Dealer+EmailLog | ☐ |
| A12 | `/api/auth/register` POST | 410 Gone (B2B-only, kapalı) | — | ☐ |
| A13 | İletişim formu / KVKK başvuru | Mail tetikler (DRYRUN) | EmailLog | ☐ |

---

## B. BAYI (DEALER) Rolü

### B.1 Erişim / durum kapısı
| # | Senaryo | Beklenen | Kontrol | Durum |
|---|---------|----------|---------|-------|
| B1 | PENDING bayi ile giriş | Yalnız `/bayi/belgeler` erişilebilir, panel kilitli mesajı | layout canlı DB kontrolü | ☐ |
| B2 | REJECTED / SUSPENDED bayi | İlgili durum mesajı, sipariş veremez | — | ☐ |
| B3 | APPROVED bayi | Tüm panel açık, sidebar firma adı + ödeme vadesi etiketi | — | ☐ |
| B4 | Bayi `/admin/...` dener | Yetki yok → `/yonetim` redirect | requireRole | ☐ |

### B.2 Belgeler (Documents CRUD)
| # | Senaryo | Beklenen | İlişki / kontrol | Durum |
|---|---------|----------|------------------|-------|
| B5 | `/bayi/belgeler` belge yükle (TAX_CERTIFICATE…) | Kayıt PENDING, dosya saklanır | DealerDocument; Blob boşsa yerel disk | ☐ |
| B6 | Kendi belgesini sil/indir | Silinir / indirilir | — | ☐ |
| B7 | Admin belgeyi onayla/reddet → bayi görünümü | Durum APPROVED/REJECTED + red notu senkron | reviewedBy/At | ☐ |

### B.3 Sipariş oluşturma (Checkout — CREATE)
| # | Senaryo | Beklenen | İlişki / kontrol | Durum |
|---|---------|----------|------------------|-------|
| B8 | Katalogdan sepete ekle, adet **manuel** değiştir | Sepet (Zustand+localStorage) güncellenir | cart-store | ☐ |
| B9 | `/odeme` — okul adı **boş** bırak | 400 / engel: okul adı zorunlu | server `schoolName` zorunlu | ☐ |
| B10 | Kargo seç (DEPODAN_TESLIM dahil) | Seçim kabul; bayide kargo ücreti 0 | shippingCost=0 (dealerId) | ☐ |
| B11 | Sözleşme onayı işaretle, siparişi tamamla (OPEN_ACCOUNT) | Sipariş PENDING oluşur | Order + OrderItem | ☐ |
| B12 | → **Stok** | Sipariş edilen adet kadar `stockQuantity` düşer (atomik) | Product.stockQuantity | ☐ |
| B13 | → **Ledger** (OPEN_ACCOUNT) | `ORDER_DEBIT` kaydı + `currentBalance` artar | DealerLedger | ☐ |
| B14 | → **Kredi limiti** aşan sipariş | 400 `CREDIT_LIMIT_EXCEEDED`, stok/sipariş yazılmaz | atomik SQL guard | ☐ |
| B15 | → **Kupon** uygula | Geçerli kupon işlenir, `usedCount` artar | Coupon + CouponRedemption | ☐ |
| B16 | → **OrderEvent** | CREATED + CONTRACTS_ACCEPTED (IP+zaman) | OrderEvent | ☐ |
| B17 | → **Mail** | Bayiye + admine bildirim (DRYRUN) | EmailLog | ☐ |
| B18 | PREPAID bayi ile OPEN_ACCOUNT seçmeyi dene | Engellenir (sadece kredi kartı yolu) | server kontrol | ☐ |
| B19 | Kredi kartı yolu (mock 3DS, OTP 123456) | Ödeme tamam → sipariş/PaymentSession | PaymentSession | ☐ |

### B.4 Sipariş görüntüleme + PDF
| # | Senaryo | Beklenen | Kontrol | Durum |
|---|---------|----------|---------|-------|
| B20 | `/bayi/siparisler` listesi | Siparişler, durum rozeti, son 3 admin notu, takip linki | — | ☐ |
| B21 | Sipariş PDF indir (`/api/orders/[id]/pdf`) | PDF iner, **fiyat yok** | invoice-pdf | ☐ |
| B22 | Teslim Fişi PDF | İner, **fiyat yok**, imza/araç/şoför alanları boş | — | ☐ |
| B23 | Başka bayinin siparişine erişim dene | 403 / engel | sahiplik kontrolü | ☐ |

### B.5 Toplu sipariş
| # | Senaryo | Beklenen | Kontrol | Durum |
|---|---------|----------|---------|-------|
| B24 | PREPAID bayi `/bayi/toplu-siparis` | `/bayi`'ye redirect (yalnız OPEN_ACCOUNT) | — | ☐ |
| B25 | Şablon indir → doldur → parse | Ürün eşleşmesi + doğrulama önizleme | bulk-order/parse | ☐ |
| B26 | Submit | Sipariş oluşur, B12–B17 ilişkileri tekrar geçerli | — | ☐ |

### B.6 Diğer bayi sayfaları
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| B27 | `/bayi/ekstre` | Devre dışı → `/bayi` redirect | ☐ |
| B28 | `/bayi/faturalar` | Fatura listesi (varsa) hatasız | ☐ |
| B29 | `/bayi/iskontolar` | Bayiye atanmış iskonto kuralları görünür | ☐ |
| B30 | `/bayi` dashboard | Firma bilgisi + sipariş istatistikleri + son 5 sipariş | ☐ |

---

## C. ADMIN Rolü — Tüm CRUD'lar ve İlişkiler

### C.1 Ürünler
| # | Senaryo | Beklenen | İlişki / kontrol | Durum |
|---|---------|----------|------------------|-------|
| C1 | `/admin/urunler` liste (100/sayfa, anlık arama, stok aralığı) | Liste + filtre çalışır | — | ☐ |
| C2 | Yeni ürün (`/admin/urunler/yeni`) | Zorunlu alanlar, dil dropdown, slug otomatik | Product create | ☐ |
| C3 | Ürün düzenle | Alanlar kaydolur | Product update | ☐ |
| C4 | **Aynı SKU** ile ikinci ürün oluştur | ⚠️ Beklenen: engel/uyarı **(BULGU #3 — şu an engellemiyor)** | sku @unique yok | ☐ |
| C5 | Görsel yükle / sil / sırala | Galeri güncellenir | ProductImage; Blob→yerel disk fallback | ☐ |
| C6 | Bulk import (Excel, dryRun) | Önizleme + upsert; SKU duplicate uyarısı | bulk-import | ☐ |
| C7 | Bulk update / bulk price / bulk image / bulk delete | Toplu işlem doğru sayıyla uygulanır | — | ☐ |
| C8 | Siparişi olan ürünü sil | Soft-delete (isPublished=false) | onDelete koruması | ☐ |
| C9 | Siparişi olmayan ürünü sil | Hard-delete | — | ☐ |

### C.2 Kategoriler / Yayınevleri
| # | Senaryo | Beklenen | Kontrol | Durum |
|---|---------|----------|---------|-------|
| C10 | Kategori CRUD (`/admin/kategoriler`) | Oluştur/düzenle/sil | — | ☐ |
| C11 | Ürünü olan kategoriyi sil | 409 + "X ürünün kategori bilgisi temizlenecek" uyarısı, force seçeneği | onDelete:SetNull | ☐ |
| C12 | Yayınevi CRUD (`/admin/yayinevleri`) | Aynı davranış | — | ☐ |

### C.3 Bayiler + Cari/Ledger
| # | Senaryo | Beklenen | İlişki / kontrol | Durum |
|---|---------|----------|------------------|-------|
| C13 | Bayi oluştur (`/admin/bayiler/yeni`) | User+Dealer (APPROVED) + mail; adres | nested create | ☐ |
| C14 | Bayi düzenle (creditLimit, paymentTerms, not) | Kaydolur | — | ☐ |
| C15 | PREPAID'e çevir | creditLimit zorla 0 | server kuralı | ☐ |
| C16 | SUSPENDED bayide alan güncelleme | Reddedilir | kilit | ☐ |
| C17 | approve / reject / suspend | Durum geçişi + bayi tarafı senkron | status | ☐ |
| C18 | Ödeme kaydet | `PAYMENT_CREDIT` ledger + `currentBalance` azalır | DealerLedger | ☐ |
| C19 | Manuel düzeltme | `MANUAL_ADJUSTMENT` ledger | — | ☐ |
| C20 | bulk-approve / bulk-adjust-credit | Toplu; skipped/notFound sayıları raporlanır | — | ☐ |
| C21 | Bayi sil | İlişkili ledger/belge/iskonto temizliği | cascade | ☐ |

### C.4 Siparişler (state machine + ilişkiler)
| # | Senaryo | Beklenen | İlişki / kontrol | Durum |
|---|---------|----------|------------------|-------|
| C22 | `/admin/siparisler` liste | Filtre (durum/tür), Okul sütunu + bayi adı, PENDING rozeti | nav-counts | ☐ |
| C23 | PENDING→APPROVED→PROCESSING→SHIPPED→DELIVERED | Sıralı geçiş, atlama engelli | ALLOWED_NEXT | ☐ |
| C24 | SHIPPED'e geçişte kargo (carrier+takip; DEPODAN_TESLIM takipsiz) | shippedAt + kargo maili | — | ☐ |
| C25 | DELIVERED'e geçiş | deliveredAt; CREDIT_CARD→paymentStatus=PAID; KolayBi taslak | Invoice | ☐ |
| C26 | DELIVERED'de OPEN_ACCOUNT sipariş | ⚠️ paymentStatus PENDING kalır **(BULGU #2)** | — | ☐ |
| C27 | Herhangi durum → CANCELLED | Stok iade + `ORDER_CANCEL_CREDIT` + kupon `usedCount-1` + Invoice CANCELLED | çok tablolu | ☐ |
| C28 | CANCELLED → PENDING (reaktivasyon) | Stok tekrar düş + `ORDER_DEBIT` | — | ☐ |
| C29 | Reaktivasyonda kupon | ⚠️ Kupon geri uygulanmaz (kayıt silinmiş) **(BULGU #1)** | — | ☐ |
| C30 | bulk-status | Toplu durum geçişi + OrderEvent | — | ☐ |
| C31 | Sipariş kalıcı sil (tekli + toplu) | Hard-delete + stok/ledger revert | hardDeleteOrderTx | ☐ |
| C32 | Fatura sayfası — "KolayBi'ye Aktar (Taslak)" | Invoice SENT/taslak; muhasebe maili (DRYRUN) | invoice-service | ☐ |
| C33 | İrsaliye / Teslim Fişi PDF (resmi başlık) | İner, fiyatsız | — | ☐ |

### C.5 Kuponlar / İskontolar
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| C34 | Kupon CRUD + bulk-create (Excel) | Oluştur/düzenle/sil | ☐ |
| C35 | İskonto CRUD (PRODUCT/CATEGORY/PUBLISHER/DISCOUNT_GROUP/GLOBAL) | Tüm scope'lar UI'dan kurulur | ☐ |
| C36 | İskonto bulk / copy / upload / simulate | Her araç çalışır; simulate doğru fiyat türetir | ☐ |
| C37 | İskonto bayi siparişinde uygulanır | Pricing hiyerarşisi (PRODUCT>CATEGORY>GROUP>PUBLISHER>GLOBAL) | ☐ |

### C.6 Kullanıcılar / Yorumlar / İzleme
| # | Senaryo | Beklenen | Durum |
|---|---------|----------|-------|
| C38 | Kullanıcı rol değiştir / parola sıfırla | Kaydolur | ☐ |
| C39 | Siparişi olan kullanıcıyı sil | Anonimleştirme; siparişsizde hard-delete | ☐ |
| C40 | bulk-delete kullanıcı | Toplu | ☐ |
| C41 | Yorum on: onay/red/sil + bulk (`/admin/yorumlar`) | Durum geçişi | ☐ |
| C42 | Faturalar (`/admin/faturalar`) — retry / durum | PENDING/FAILED retry, manuel durum | ☐ |
| C43 | Muhasebe export (`/admin/muhasebe`) | Excel/rapor iner, **fiyat/KDV burada görünür** | ☐ |
| C44 | Analytics / email-log / error-log | Veriler hatasız listelenir | ☐ |
| C45 | nav-counts rozetleri | PENDING sipariş/bayi/yorum sayıları doğru | ☐ |

---

## D. Çapraz / İlişki Bütünlük Matrisi

Sipariş yaşam döngüsünün **her geçişinde** aşağıdaki zincirin tutarlı olduğunu doğrula
(`prisma studio` ile satır satır):

| Geçiş | Stok | DealerLedger | Coupon.usedCount | Invoice | OrderEvent |
|-------|------|--------------|------------------|---------|-----------|
| CREATE (OPEN_ACCOUNT) | −adet | +ORDER_DEBIT | +1 (kuponluysa) | PENDING (taslak) | CREATED |
| CREATE (kredi kartı) | −adet | — | +1 | — | CREATED |
| → CANCELLED | +adet iade | +ORDER_CANCEL_CREDIT | −1 | CANCELLED | CANCELLED |
| CANCELLED → PENDING | −adet | +ORDER_DEBIT | ⚠️ geri gelmez (#1) | PENDING | NOTE/PENDING |
| → DELIVERED (kart) | — | — | — | SENT | DELIVERED |
| → DELIVERED (açık hesap) | — | — | — | SENT | DELIVERED; ⚠️ paymentStatus PENDING (#2) |
| Hard-delete | +adet iade | revert | revert | sil | sil |

Ek kontroller:
- **Soft-delete:** silinen siparişler tüm okuma uçlarında `deletedAt: null` ile gizleniyor mu?
- **Enum tutarlılığı:** UI label sabitleri (`constants.ts`) ↔ Zod şema (`validations.ts`) ↔ Prisma enum birebir.
- **Yetki:** her API ucu doğru `requireRole` / `requireApprovedDealer` / sahiplik kontrolüne sahip mi?

---

## E. Doğrulanmış Bulgular Kataloğu

> Aşağıdakiler kod kanıtıyla doğrulandı. Yanlış pozitifler (GLOBAL iskonto UI, kategori/yayınevi
> silme uyarısı, bulk-approve skip raporu, fatura hata bildirimi, DEPODAN_TESLIM) elenmiştir.

| # | Bulgu | Kanıt (file:line) | Şiddet | Karar | Durum |
|---|-------|-------------------|--------|-------|-------|
| 1 | **İptal→reaktivasyonda kupon geri uygulanmıyor.** İptalde `CouponRedemption` hard-delete; CANCELLED→PENDING'de kupon kaybolur, admin elle işlemeli. | `app/api/admin/orders/[id]/status/route.ts:193,219-220` | Yüksek | _açık_ | ☐ |
| 2 | **OPEN_ACCOUNT siparişte `paymentStatus` asla PAID olmuyor.** Yalnız CREDIT_CARD+DELIVERED'de PAID. Açık hesap ödemesi yalnız cari/ledger'da; rapor/UI boşluğu. | `…/status/route.ts:272-279`; `app/api/admin/dealers/[id]/payments/route.ts` | Orta | _açık_ | ☐ |
| 3 | **`Product.sku` `@unique` değil; manuel create/update'te tekrar kontrolü yok** (yalnız bulk-import kontrol ediyor). Çift SKU oluşabilir. | `prisma/schema.prisma:174`; `app/api/admin/products/route.ts`; `app/api/admin/products/[id]/route.ts`; (kontrol: `bulk-import/route.ts:214-217`) | Orta | _açık_ | ☐ |
| 4 | **`Product.nameEn` ölü kolon** — hiç yazılmıyor/okunmuyor (form'dan 2026-06-08'de kaldırıldı, kolon kaldı). | `prisma/schema.prisma:172`; `app/api/admin/products/route.ts:50` | Düşük | _açık_ | ☐ |

### Önerilen düzeltme yönleri
- **#1 (Yüksek):** İptalde `CouponRedemption`'ı hard-delete yerine işaretle **veya** `Order`'a
  `couponCode`/`couponId` snapshot yaz; reaktivasyonda geri uygula. (Yön kullanıcı ile seçilecek.)
- **#3 (Orta):** En düşük riskli: create/update route'larına bulk-import'taki duplicate-SKU
  kontrolünü taşı (net UI hatası). Şema `@unique` migration'ı opsiyonel — önce mevcut veride
  `SELECT sku, COUNT(*) ... HAVING COUNT(*)>1` ile tekrar var mı kontrol et.
- **#2 (Orta):** Karar gerekli — (a) raporda cari bakiyeden "ödendi" türet, veya
  (b) `PAYMENT_CREDIT` bakiyeyi kapattığında `order.paymentStatus=PAID` yaz.
- **#4 (Düşük):** Temizlik — şemadan kaldır + migration, ya da olduğu gibi bırak.

### Derin kod denetimi sonuçları (2026-06-10 — kanıtlı)

**Net hatalar (düzeltilecek):**
| # | Bulgu | Kanıt | Şiddet |
|---|-------|-------|--------|
| B1 | **bulk-status iptalde kupon + fatura yan etkilerini atlıyor.** Tekil route kupon `usedCount-1`+redemption sil (`status/route.ts:184-194`) ve invoice→CANCELLED (`:199-214`) yapıyor; bulk yalnız stok+ledger yapıyor → kupon kullanımı şişer, iptal siparişin faturası KolayBi'ye gidebilir. | `app/api/admin/orders/bulk-status/route.ts:153-213` | Yüksek |
| B2 | **Ödeme-iptal yolları faturayı CANCELLED yapmıyor.** mock/confirm, iyzico callback/webhook siparişi CANCELLED yapıp stok iade ediyor ama Invoice'a dokunmuyor; retry-cron iptal siparişin faturasını KolayBi'ye **gerçek kayıt** olarak gönderebilir. | `payments/mock/confirm/route.ts`, `payments/iyzico/callback/route.ts`, `payments/iyzico/webhook/route.ts`; `invoice-service.ts` (sendPendingInvoice'ta order.status guard yok) | Yüksek |
| B3 | **Fiyat sızıntısı (3 JSON ucu).** UI'da `PriceDisplay→null` ama API'ler ham fiyat döndürüyor: oturumsuz herkes `price`/`oldPrice` okuyabiliyor. | `api/products/[id]/route.ts:70-71`, `api/search/route.ts:64`, `api/cart/refresh/route.ts:84-91` | Yüksek (karar gerekli) |
| B4 | **Stok çift-iade riski.** 3DS-FAILURE sonra REFUND akışında iki ayrı guard (paymentStatus vs PaymentSession.status) → stok iki kez iade edilebilir. | `payments/iyzico/webhook/route.ts:64`, `callback/route.ts:148` | Orta |
| B5 | **Sipariş onay maili mutable `shipping.email`'e gidiyor**, oturumdaki bayi e-postasına değil. | `api/orders/route.ts` (queueEmail to: shipping.email) | Orta |
| B6 | **Bayi kupon istifleme.** UI kupon kutusunu bayiye gizliyor ama server `couponCode`'u bayi için reddetmiyor → elle istek B2C kuponu B2B fiyatına ekler. | `api/orders/route.ts` (evaluateCoupon, isDealer guard yok) | Orta |
| B7 | **Para yuvarlama.** `subtotal`/`discountTotal` ham float saklanıyor (yalnız vatTotal/total yuvarlı) → `123.45000…002`, total ≠ subtotal−discount. | `api/orders/route.ts:211-212,331-332`; `dealer/bulk-order/submit/route.ts` | Orta |
| B8 | **iyzico/init misafir yolu.** Oturum yoksa sahiplik kontrolü atlanıyor; orderId bilen herkes ödeme başlatabilir (dealer-only sistemde misafir yok). | `payments/iyzico/init/route.ts:72-76` | Orta |
| B9 | **Ürün düzenlemede zorunlu alan `null` gönderiliyor** → schema `string\|undefined` bekler, çirkin "Expected string, received null" 400. | `components/admin/product-form.tsx:111-116` ↔ `validations.ts:352,372` | Orta/Düşük |
| B10 | **İskonto scope/FK çapraz-doğrulama yok.** `{scope:GLOBAL, productId:x}` geçerli sayılır → tutarsız satır + dedupe kirlenir. | `api/admin/discounts/route.ts`, `validations.ts:333-336` | Orta |
| B11 | **Bayi oluşturmada il/ilçe doğrulaması yok** (diğer tüm adres yollarında var). | `admin/bayiler/yeni/page.tsx:110-111`, `validations.ts:154-156` | Orta |
| B12 | **SKU benzersiz değil; manuel create/update'te tekrar kontrolü yok** (yalnız bulk-import). | `prisma/schema.prisma:174`, `products/route.ts`, `products/[id]/route.ts` | Orta |

**Tasarım kararı gerektirenler:**
| # | Konu | Not |
|---|------|-----|
| D1 | **Soft-delete hiç uygulanmamış.** `deletedAt` kolonu var ama hiçbir yer yazmıyor/filtrelemiyor; hard-delete gerçek siliyor (KolayBi'ye gitmiş SENT fatura dahil). Yasal 10-yıl saklama ile çelişir. | `order-delete.ts:63`; şema `:345-350` |
| D2 | **OPEN_ACCOUNT siparişte paymentStatus asla PAID olmuyor** (rapor boşluğu). | önceki #2 |
| D3 | **İptal→reaktivasyonda kupon geri gelmiyor** (redemption silindiği için). | önceki #1 / B1 ile bağlantılı |
| D4 | **nameEn ölü kolon** — temizle ya da bırak. | önceki #4 |
| D5 | **Bayi şirket alanları (companyName/taxNumber…) API'de düzenlenebilir ama UI yok.** | `dealer-actions.tsx` PATCH yalnız paymentTerms/creditLimit/notes gönderir |

**Doğru çalıştığı teyit edilenler (yanlış pozitif):** admin route'larda auth guard'lar eksiksiz; order/document/address IDOR yok; kredi limiti atomik ve tüm sipariş yollarında; session tazeleme (suspended bayi anında bloke); pricing hiyerarşisi + KDV çıkarımı doğru; GLOBAL iskonto UI, kategori/yayınevi silme uyarısı, bulk-approve skip raporu, fatura retry-tükenme bildirimi, DEPODAN_TESLIM.

---

## F. Uygulanan Çözümler (2026-06-10)

> Doğrulama: `npx tsc --noEmit` temiz; `npx vitest run` → 163 test geçti (yalnız DB
> bağlantısı gerektiren `product-image-ordering` entegrasyon testi ortam nedeniyle
> atlandı, değişikliklerle ilgisiz).

| # | Çözüm | Dosya(lar) |
|---|-------|-----------|
| B1 + D3 | İptal/reaktivasyon yan etkileri **ortak helper**'a çıkarıldı (tekil + bulk artık aynı mantık). İptalde kupon redemption KORUNUYOR, `usedCount` azaltılıyor; reaktivasyonda artırılıyor → kupon geri yükleniyor. bulk-status artık kupon + fatura yan etkilerini de yapıyor + KolayBi iptal muhasebe bildirimi. | `lib/order-side-effects.ts` (yeni), `orders/[id]/status/route.ts`, `orders/bulk-status/route.ts` |
| B2 | `sendPendingInvoice` artık `order.status === CANCELLED` ise faturayı göndermez, CANCELLED'a çeker → retry-cron + ödeme-iptal yolları iptal siparişin faturasını KolayBi'ye göndermez. Üç ödeme-iptal yolu da ortak helper'a bağlandı (fatura iptal tutarlılığı). | `lib/invoice-service.ts`, `payments/mock/confirm`, `payments/iyzico/callback`, `payments/iyzico/webhook` |
| B3 | Fiyat public uçlardan kaldırıldı: `search` → fiyat yok; `products/[id]` → fiyat yalnız admin; `cart/refresh` → fiyat yalnız onaylı bayi (public 0). | `api/search`, `api/products/[id]`, `api/cart/refresh`, `components/layout/search-combobox.tsx` |
| B4 | Stok çift-iade engeli: tüm ödeme-iptal yolları sipariş zaten CANCELLED ise yan etki uygulamaz (status-bazlı idempotent guard). | `payments/iyzico/webhook`, `callback`, `mock/confirm` |
| B5 | Sipariş onay maili bayinin hesap e-postasına gider (mutable shipping.email değil). | `api/orders/route.ts` |
| B6 | Bayi siparişinde `couponCode` server'da reddedilir (kupon istifleme kapandı). | `api/orders/route.ts` |
| B7 | `subtotal`/`discountTotal` 2 ondalığa yuvarlanıp saklanıyor (float drift giderildi). | `api/orders/route.ts` |
| B8 | iyzico/init misafir yolu kapatıldı (oturum + sahiplik zorunlu). | `payments/iyzico/init/route.ts` |
| B10 | discountRuleSchema transform: scope'a uymayan FK'ler null'lanır (tutarsız satır + dedupe kirlenmesi engellendi). | `lib/validations.ts` |
| B11 | Admin bayi oluşturmada adres girilirse il/ilçe doğrulanır. | `lib/validations.ts` |
| B12 | Ürün create/update'te SKU tekrarı engellendi (409). | `api/admin/products/route.ts`, `[id]/route.ts` |
| D1 | KolayBi'de kesilmiş (SENT) faturalı sipariş kalıcı silinemez (409). Hard-delete'te kupon `usedCount` düzeltmesi. | `lib/order-delete.ts`, `orders/[id]/route.ts`, `bulk-delete/route.ts` |
| D2 | Admin sipariş detayında açık hesap için "ödeme cariden takip edilir" rozeti (paymentStatus'a dokunulmadı). | `admin/siparisler/[id]/page.tsx` |
| D5 | Admin bayi detayında firma alanları (firma adı/vergi dairesi/vergi no/sicil/yetkili) düzenlenebilir. | `components/admin/dealer-actions.tsx`, `admin/bayiler/[id]/page.tsx` |

**İptal edilen / yanlış pozitif olduğu görülen kararlar:**
- **B9 (ürün düzenlemede null alan):** Yanlış pozitif. `requiredString` Zod v4 `{ error }` ile null'a da dostça "X zorunludur." mesajı veriyor; ayrıca form guard'ı zaten boş alanı engelliyor. Çirkin hata oluşmuyor.
- **D4 (nameEn ölü kolon):** **İPTAL.** nameEn ölü değil — `urunler/[slug]` ürün detayında "İngilizce Adı" gösteriliyor, `search.ts`/arama kullanıyor, bulk-import dolduruyor. Kaldırmak regresyon olurdu. (Tek eksik: admin tekil ürün formu nameEn set etmiyor — küçük UX boşluğu, ölü kolon değil.)
