# Master Education — Yol Haritasi

> **Kaynak:** Full audit raporu (storefront + admin/bayi + API & is mantigi), 2026-04-24.
> Her madde tamamlandikca `[ ]` → `[x]` yapilacak. Her fazin sonuna `Tamamlandi: YYYY-MM-DD` notu eklenir.

## Durum ozeti

| Faz | Ad | Durum |
|---|---|---|
| Faz 0 | Veri temizligi (gorselsiz urunler + orphan dosyalar) | ✅ 2026-04-24 |
| Faz 1 | Production blockers (is mantigi + guvenlik) | ✅ 2026-04-24 (1.1 + 1.4 sonraya) |
| Faz 2 | Admin & bayi eksikleri | ✅ 2026-04-24 |
| Faz 3 | Audit, polish, UX | ✅ 2026-04-24 |
| Faz 4 | Entegrasyon & olcek (odeme, SMTP, kargo, deploy) | ✅ kod-hazır 2026-05-06 (canlı sandbox env-bağımlı) |
| Faz 5 | Internal polish (UX + security + email verify) | ✅ 2026-04-24 |
| Faz 6 | Final eksikler (panel UX + cron + PDF) | ✅ 2026-04-26 |
| Faz 7 | Adres il+ilçe + admin user anonymize | ✅ 2026-04-26 |
| Faz 8 | Bayi `paymentTerms` (PREPAID vs OPEN_ACCOUNT) | ✅ 2026-04-26 |
| Faz 9 | `DiscountScope.CATEGORY` + pricing engine | ✅ 2026-04-26 |
| ~~Faz 10 (eski)~~ | ~~Bayi fiyat gizleme + DealerProductPrice~~ | ❌ İptal — bayi kendi fiyatını görmeli, gizleme istenmiyor |
| Faz 10 | Ürün multi-select + alan bazlı toplu güncelleme (KDV/fiyat/stok/kategori/yayınevi/grup/publish/sil) | ✅ 2026-04-26 |
| Faz 11 | Yayınevi/kategori bazlı toplu fiyat sayfası + bulk-import upsert mode | ✅ 2026-04-26 |
| Faz 12 | Sipariş + bayi toplu işlemler (status/kargo, approve, credit adjust) | ✅ 2026-04-26 |
| Faz 13 | Kupon toplu üretme + yorum + kullanıcı bulk yönetimi | ✅ 2026-04-26 |
| Faz 14 | Görsel toplu yükleme (ZIP — dosya adı = SKU) | ⏳ |
| Faz 15 | SKU → ISBN UI rename (label-only) | ✅ 2026-04-26 |
| Faz 16 | Güvenlik denetimi & sertleştirme | ✅ 2026-04-26 |
| Bölüm 1 | Storefront + Public/Account/Dealer API + Lib production audit | ✅ 2026-05-06 |
| Bölüm 2 | Admin paneli + Bayi paneli + DB + OWASP tur 3 | ✅ 2026-05-06 |
| Bölüm 3 | Faz 4 entegrasyonlar + QA + ops (RUNBOOK/RECOVERY) + P2/P3 batch fix | ✅ 2026-05-06 |

---

## FAZ 0 — Veri Temizligi ✅ Tamamlandi (2026-04-24)

- [x] **0.1** DB'de gorselsiz urun sayisi dogrulandi — **211 urun** (yayinevi dagilimi: UNIVERSAL 84, EXPRESS 35, CLUEKEY 25, EDULINK 25, COMPASS 17, DIFUSION 11, COLLINS 6, KLETT 4, PEARSON 3, EDINUMEN 1)
- [x] **0.2** Orphan gorseller tespit edildi — **5594 dosya (~1.3 GB)**: `_75 / _100 / _200 / _350` thumbnail varyantlari + DB'de karsiligi olmayan ana gorseller
- [x] **0.3** Arsiv klasoru olusturuldu: `211 urun gorselsiz/archive/2026-04-24/`
- [x] **0.4** `products.csv` + `products.json` yazildi (211 urun, id/slug dahil — geri alma icin)
- [x] **0.5** 5594 orphan gorsel `archive/2026-04-24/orphan-images/` altina tasindi
- [x] **0.6** 211 urun `isPublished=false` yapildi (soft delete)
- [x] **0.7** `docs/MISSING_IMAGES.md` guncellendi

**Son durum:** Yayinda 4687 urun, gizli 211, toplam 4898. `public/images/products/` dizini 11357 → 5763 dosyaya indi.

**Testler:**
- `scripts/test-faz0.ts` — **29/29 basarili** (DB sayilari, listing, detay, orders, bulk-order, admin, sitemap, arsiv butunlugu, rollback)
- `npx vitest run` — **37/37 basarili** (regresyon yok)

**Kalici scriptler (`scripts/`):**
- `archive-missing-images.ts` — yeni gorselsiz urun cikarsa tekrar calistirilabilir (`--execute` flag'i ile)
- `test-faz0.ts` — regresyon testi
- `verify-counts.ts` — hizli sayi kontrolu
- `inspect-orphans.ts` — orphan dosya analizi

---

## FAZ 1 — Production Blockers (is mantigi + guvenlik)

Production'a gitmeden once kapanmasi sart. Odeme ve SMTP sonraya birakildi (Faz 4).

- [ ] **1.1** **[SONRAYA]** SMTP (Resend) konfigurasyon + tum email template'lerini canli test → Faz 4.1
- [x] **1.2** **Kredi limiti race condition fix** ✅ 2026-04-24
  - `src/lib/ledger.ts` — atomik `UPDATE ... RETURNING` + `enforceCreditLimit` flag (iki race birden: limit guard + balance overwrite)
  - `src/app/api/orders/route.ts` — tx oncesi pre-check kaldirildi, flag tx icinde kullaniliyor, `CREDIT_LIMIT_EXCEEDED` handler eklendi
  - `src/app/api/dealer/bulk-order/submit/route.ts` — ayni fix
  - `tests/ledger.test.ts` — 10 test (onceki 3 + 7 yeni credit-limit senaryosu)
  - `scripts/test-credit-limit-race.ts` — **gercek DB'de** 5 paralel 300 TL siparis, limit 1000 → 3 kabul, 2 ret, bakiye 900. ✓
  - Yan dokunus: `kategoriler/[slug]`, `yayinevleri/[slug]` pre-existing TS hata duzeldi (ProductFilters props)
- [x] **1.3** **MAGIC_OTP guard** ✅ 2026-04-24
  - `src/lib/env.ts` — yeni `ENABLE_MOCK_PAYMENTS` env degiskeni + `isMockPaymentsAllowed()` helper + `mockPaymentsEnabled()`
  - `src/app/api/payments/mock/confirm/route.ts` — prod'da 403 don
  - `src/app/(storefront)/odeme/3d/[token]/page.tsx` — prod'da notFound()
  - `tests/mock-payments.test.ts` — 4 test (dev/test: acik, prod: kapali, prod + flag: acik)
  - Davranis: **dev/test'te her zaman acik**, **prod'da `ENABLE_MOCK_PAYMENTS=true` olmadikca kapali** (staging icin kapi birakildi)
- [ ] **1.4** **[SONRAYA]** Iyzico/Param odeme gateway → Faz 4.2
- [x] **1.5** **Prod secrets hazirligi** ✅ 2026-04-24
  - `.env.example` olusturuldu (tum keyler + aciklamalar)
  - `.gitignore`'a `!.env.example` override'i eklendi (template track edilecek)
  - `scripts/generate-secret.ts` — `npx tsx scripts/generate-secret.ts` → 64 char rastgele secret
  - `scripts/change-admin-password.ts` — `npx tsx scripts/change-admin-password.ts <email> <pwd>` (min 12 char, harf+rakam dogrulamasi)
  - **Deploy oncesi adimlar (runbook):**
    1. `NEXTAUTH_SECRET` uret → prod env'e koy
    2. Admin sifresini degistir (`change-admin-password.ts`)
    3. `ADMIN_EMAIL` gercek posta kutusu
    4. `NEXTAUTH_URL` prod domain
    5. `ENABLE_MOCK_PAYMENTS` bos birak (prod'da kapali)
- [x] **1.6** **Payment session concurrency fix** ✅ 2026-04-24
  - `src/app/api/payments/mock/confirm/route.ts` — atomik claim: `updateMany` `WHERE status='PENDING' AND expiresAt > NOW()`. Loser 409 doner.
  - Hem `success` hem `failure` pathinde ayni claim pattern (stok iki kere geri yuklenmez)
  - Expiry mark de atomic oldu
  - `scripts/test-payment-session-race.ts` — 5 paralel claim → 1 kazanan, 1 audit, 1 PAID. ✓

---

## FAZ 2 — Admin & Bayi Eksikleri

- [x] **2.1** **Urun bulk import (Excel)** ✅ 2026-04-24
  - `src/app/api/admin/products/template/route.ts` — branded Excel (Urunler + Yayinevleri + Kategoriler referans sayfalari)
  - `src/app/api/admin/products/bulk-import/route.ts` — parse + validate + `?dryRun=1` ile preview, all-or-nothing transaction insert
  - `src/app/admin/urunler/toplu-yukleme/page.tsx` + `bulk-import-form.tsx` — 3 adim UI (Sablon indir / Dosya sec / Preview & Yukle), istatistik kartlari + hata listesi + ilk 20 satir preview
  - Admin urunler listesine "Toplu Yukle" linki eklendi
  - Header-row otomatik tespit, yayinevi/kategori NAME → ID cevir, slug dosya ici benzersizlestir
  - Audit log (`PRODUCT_BULK_IMPORT`)
  - `scripts/test-product-bulk-import.ts` — 8/8 dogrulama (3 urun insert, field bazli kontrol, cleanup)
  - **Bonus fix**: branded Excel'lerdeki footer row'u ile ilgili ortak bug (upload endpoint'i footer'i data satiri olarak gorur) tum 3 upload/parse yerinde kapandi
- [x] **2.2** **Iskonto bulk import UI + validasyon** ✅ 2026-04-24
  - Upload endpoint + UI zaten tamdi; benim eklemelerim: header-row otomatik tespit + branded template uyumu
  - `src/app/api/admin/discounts/upload/route.ts` — ilk 15 satirda "scope" + "discountPct" arar (branded template row 1'de marka var)
  - `src/app/api/dealer/bulk-order/parse/route.ts` — ayni pattern, Turkce basliklar ("Adet") da kabul
  - `scripts/test-branded-excel-roundtrip.ts` — 8/8 dogrulama
  - Satir bazli validasyon (scope + pct + required id) mevcut, hatalar kullaniciya gosteriliyor
  - All-or-nothing transaction mevcut + audit log mevcut
- [x] **2.3** **Bayi belge onay workflow** ✅ 2026-04-24
  - Migration `20260424000000_add_dealer_document_review` — enum `DealerDocumentStatus` (PENDING/APPROVED/REJECTED) + `reviewNote` + `reviewedAt` + `reviewedBy` + status index
  - `src/app/api/admin/dealers/[id]/documents/[docId]/route.ts` — yeni PATCH handler, REJECTED icin not zorunlu, audit log (`DEALER_DOCUMENT_REVIEW`)
  - `src/components/dealer-documents.tsx` — status badge (Inceleniyor/Onayli/Reddedildi), ret notu bayi tarafinda gosteriliyor, admin icin `canReview` propu ile Onayla/Reddet butonlari + not girisi + "Durumu sifirla"
  - `src/lib/audit.ts` — `DEALER_DOCUMENT_REVIEW` audit action
  - Bayi `/bayi/belgeler` + Admin `/admin/bayiler/[id]` her ikisi de yeni alanlari aktariyor
  - `scripts/test-dealer-document-review.ts` — 12/12 dogrulama
  - Email bildirimi Faz 4.1'de (SMTP etkinleşince)
- [x] **2.4** **Kullanici rol degistir UI** ✅ 2026-04-24 (zaten tamdi)
  - Audit raporu yanlis bilgi vermis — UI + API tamamen implemente.
  - `src/components/admin/user-actions.tsx` — role select + save + delete
  - `PATCH /api/admin/users/[id]/role` + `DELETE /api/admin/users/[id]` — son admin korumasi, siparisli user silme engeli, audit log
  - `scripts/test-user-role-change.ts` — 5/5 dogrulama testi
  - Karar: **CUSTOMER → DEALER** yalniz daha once basvurmus kullanicilara aciliyor (Dealer record sart). Dogru davranis.
- [x] **2.5** **Yarim/bos sayfalari kapat** ✅ 2026-04-24 (zaten tamdi)
  - Audit raporu yanilmis. Uc sayfa da tam implemente:
    - `/karsilastir` — Zustand compare-store, max 4 urun, fiyat/stok/yayinevi tablosu, sepete/favoriye ekle
    - `/siparis-takip` — email + order-number formu (guest friendly), sonuc karti, kargo takip linki
    - `/kargo-takip/[no]` — timeline UI, status adimlari, ETA hesap, mock uyarisi — Faz 4.3'te gercek carrier API ile degisecek
  - `compare-store`, `wishlist-store`, `toast-store`, `recently-viewed-store` mevcut; Header/Footer'da linkler var

---

## FAZ 3 — Audit, Polish, UX

### 3.A — Audit & logging

- [x] **3.1** `ORDER_CREATE` audit log ✅ 2026-04-24 (`orders/route.ts` + metadata: orderNumber, total, paymentMethod, itemCount, dealerId, guest)
- [x] **3.2** `DEALER_APPLY` audit log ✅ 2026-04-24

### 3.B — Guvenlik & robustness

- [x] **3.3** Suspended dealer defansif re-check ✅ 2026-04-24 — tx icinde `dealer.status === "APPROVED"` fresh read; orders + bulk-order ikisinde de
- [x] **3.4** Dealer document upload rate limit ✅ 2026-04-24 — bayi: 30/saat, admin: 100/saat
- [x] **3.5** FTS try/catch fallback ✅ 2026-04-24 — `search.ts` invalid query → ILIKE (name/sku/nameEn) fallback + error log
- [x] **3.6** Password reset TTL test ✅ 2026-04-24 — 11 dogrulama (TTL 60dk, once-use, yeni token eskiyi invalidate, expired reddedilir)

### 3.C — UX & bilgi gosterimi

- [x] **3.7** Bayi ret/suspend sebebi ✅ 2026-04-24 — bayi layout'ta `rejectionReason` ve `notes` kart ile gosterilir
- [x] **3.8** Bayi ekstre CSV + Excel export ✅ 2026-04-24 — `/api/dealer/statement` (branded XLSX + CSV), bayi ekstre sayfasinda iki buton
- [x] **3.9** `/api/cart/refresh` sync ✅ 2026-04-24 — zaten tamdi; test ile dogrulandi (silinen/gizli/stoksuz urun flag'leri)
- [x] **3.10** SEO dinamik meta ✅ 2026-04-24 — canonical URL, absolute OpenGraph/Twitter images, JSON-LD + Offer + seller + itemCondition

### 3.D — KVKK & hesap

- [x] **3.11** Hesap silme (KVKK) ✅ 2026-04-24
  - `/api/account/delete` — sifre + "HESABIMI SIL" onay, hard delete (siparis yoksa) veya anonymize (varsa)
  - `/hesabim/hesabi-sil` — aciklamali form
  - Admin korumali, onayli bayi korumali
  - Anonymize: email → `deleted-xxx@example.invalid`, name → "Silinen Kullanici", phone null, adres alanlari bosaltilir, sepet + reset tokenlar silinir
  - Audit log `USER_SELF_DELETE`
  - 13/13 test

### 3.E — Indexler & perf

- [x] **3.12** `Product.isPublished` index ✅ 2026-04-24
  - Migration `20260424010000_add_product_is_published_index`
  - Uc index: `(isPublished)`, `(isPublished, createdAt DESC)`, `(isPublished, price)`
- [x] **3.13** Select prune ✅ 2026-04-24
  - `/urunler`, `/kategoriler/[slug]`, `/yayinevleri/[slug]` — `include` → `select` ile sadece gorunen alanlar cekiliyor

---

## FAZ 4 — Entegrasyon, Olcek, Deployment

- [x] **4.1** **SMTP (Resend) entegrasyonu** ✅ 2026-05-06 (kod-hazır; canlı test deploy öncesi RUNBOOK §1.1)
  - [x] `.env.example`'da `RESEND_API_KEY` + `SMTP_FROM` dokümante
  - [x] `src/lib/email.ts` — DRYRUN dev/staging only; production'da SMTP eksik = `console.error` warn (Bölüm 1 P1-LIB-3)
  - [x] 10 template `escapeHtml()` ile XSS-safe (Faz 17)
  - [ ] **Canlı sandbox doğrulama** — env-bağımlı (RUNBOOK pre-deploy)
- [x] **4.2** **Odeme gateway** (Iyzico) ✅ 2026-05-06 (commit `10d0db5` — kod-hazır)
  - [x] `src/lib/adapters/iyzico.ts` — PKI HMAC-SHA1 init + HMAC-SHA1 callback verify + HMAC-SHA256 webhook verify + refund
  - [x] `src/app/api/payments/iyzico/init|callback|webhook/route.ts` — atomic claim + idempotency
  - [x] Mock endpoint prod'da 404 (önceden 403)
  - [x] OrderEvent.PAYMENT_* event'leri yazılır
  - [ ] **Sandbox 4 senaryo + iade canlı testi** — env-bağımlı (RUNBOOK pre-deploy)
- [x] **4.3a** **Kargo takibi altyapisi (A — manuel ama tam)** ✅ 2026-04-24
  - Migration `20260424030000_add_order_events_tracking` — `CargoCarrier` enum (Aras/Yurtici/MNG/PTT/Surat/Kolay Gelsin/HepsiJet/Trendyol/Other), `OrderEventType` enum, `OrderEvent` tablosu, `deliveredAt`, `estimatedDeliveryAt`, `trackingCarrierName`
  - `src/lib/cargo-carriers.ts` — 9 firma + gercek takip URL template'leri
  - Admin `order-status-form`: kargo firmasi dropdown, tahmini teslim tarihi, admin notu (timeline'da gorunur)
  - Musteri `/kargo-takip/[no]`: gercek `OrderEvent` timeline, eksik adimlar gri, **kargo sirketinin kendi sitesine** link butonu
  - Email template: kargo firmasi, takip no, ETA, iki buton (kargo sitesi + bizim takip sayfasi)
  - Siparis olusturma -> `CREATED` event otomatik
  - `scripts/backfill-order-events.ts` — gecmis 17 siparis icin 43 event backfill edildi
- [x] **4.3b** **Gercek kargo API entegrasyonu (Shipentegra)** ✅ 2026-05-06 (commit `10d0db5` — kod-hazır)
  - [x] `src/lib/adapters/shipping.ts` — Shipentegra real adapter (quote/createLabel/fetchTracking/webhook verify) + Mock fallback
  - [x] `/api/webhooks/shipping` — HMAC-SHA256 verify + occurredAt dedupe → OrderEvent upsert
  - [x] `/api/cron/sync-shipping-tracking` (vercel.json `*/30 * * * *`)
  - [ ] **9 carrier live URL doğrulama** — env-bağımlı (RUNBOOK pre-deploy)
- [x] **4.4** Rate-limit Upstash Redis adapter ✅ 2026-05-06 (commit `10d0db5`)
  - [x] `src/lib/rate-limit.ts` — env varsa Upstash REST pipeline (sliding window ZADD/ZCARD), yoksa in-memory fallback
  - [x] `rateLimitAsync()` API + `rateLimitBackend()` diagnostic
  - [ ] **Upstash hesabı + env set** — env-bağımlı (RUNBOOK pre-deploy)
- [x] **4.5** Ust klasor temizligi ✅ 2026-04-24
  - `thumbs.zip` (5.88 GB) → `211 urun gorselsiz/archive/thumbs-source.zip` (silmedim, tasidim — geri alinabilir)
  - `Prdocut.csv` + `ProductMapping.csv` seed icin gerekli, korundu
  - Ust klasor 5.9 GB → 4 MB indi
- [x] **4.6** Observability ✅ 2026-05-06 (commit `10d0db5`)
  - [x] `src/lib/sentry.ts` — Envelope API direkt, DSN yoksa no-op, PII scrubber (password/token/auth/email/phone redact)
  - [x] `src/lib/error-log.ts` Sentry hook (DB + Sentry paralel, ne biri ne diğeri caller'i bloklar)
  - [x] `.env.example` `SLACK_ALERT_WEBHOOK` dokümante
  - [ ] **Sentry hesabı + DSN** — env-bağımlı (RUNBOOK pre-deploy)
- [x] **4.7** **Deployment — Vercel** ✅ 2026-05-06 (CI scaffold)
  - [x] `vercel.json` cron config (4 mevcut + sync-shipping-tracking eklendi)
  - [x] `.github/workflows/ci.yml` lint + typecheck + vitest + integration + Playwright + bolum3 smoke
  - [x] `/api/health` endpoint — uptime monitor için
  - [x] `docs/RUNBOOK.md` deploy/rollback/incident playbook
  - [x] `docs/RECOVERY.md` RTO/RPO matrisi + 5 senaryo playbook
  - [ ] **Custom domain + SSL + canary deploy** — Vercel dashboard adımı (RUNBOOK §2.3)

---

---

## FAZ 6 — Final Eksikler ✅ Tamamlandi (2026-04-26)

Audit raporundaki entegrasyon-disi eksikler. Faz 4 (SMTP/Iyzico/Sentry/Redis/Railway/Shipentegra) dis servis hesabi gerektirdigi icin ayri.

- [x] **6.1** Admin & Bayi error boundaries — `src/app/admin/error.tsx` + `src/app/bayi/error.tsx`. Panel-aware mesaj ("Yonetim panelinde hata" / "Bayi panelinde hata"), client-error log, geri donus linkleri panel'in kendi anasayfasina.
- [x] **6.2** Loading skeleton'lari — 6 yerde:
  - `src/app/(storefront)/loading.tsx` — generik storefront grid
  - `src/app/(storefront)/urunler/loading.tsx` — ürün listesi (filtre + grid)
  - `src/app/(storefront)/urunler/[slug]/loading.tsx` — detay (görsel + bilgi)
  - `src/app/(storefront)/hesabim/siparislerim/loading.tsx` — sipariş kartları
  - `src/app/admin/loading.tsx` — tablo iskeleti
  - `src/app/bayi/loading.tsx` — generik panel
- [x] **6.3** Fatura PDF indirme — `?print=1` query ile `PrintTrigger` mount edilir, browser otomatik yazdırma açar (kullanıcı "PDF olarak kaydet" seçebilir). Server-side pdfkit eklenmedi (~600KB + InvoiceView mantığını ikinci kez yazma maliyeti). `siparislerim/page.tsx`'e "PDF olarak indir" linki eklendi (`/fatura?print=1`).
- [x] **6.6** Cron temizlik endpoint'leri:
  - `src/lib/cron-auth.ts` — `Authorization: Bearer ${CRON_SECRET}` doğrulaması (timing-safe). `CRON_SECRET` tanımsızsa endpoint 503 döner — yanlışlıkla public erişim engellenir.
  - `src/app/api/cron/cleanup-payment-sessions/route.ts` — expired PENDING `PaymentSession`'ları EXPIRED'a çeker. Vercel Cron: 15 dakikada bir.
  - `src/app/api/cron/cleanup-reset-tokens/route.ts` — expired veya 7 günden eski kullanılmış `PasswordResetToken`'ları siler. Vercel Cron: günde 1 (03:00 UTC).
  - `vercel.json` — cron schedules.
  - `src/lib/env.ts` + `.env.example` — `CRON_SECRET` opsiyonel env (16+ char).
  - `tests/cron-auth.test.ts` — 5/5 test (missing/wrong/right token, scheme check, length check).

**Not düşülen:** Audit raporundaki bazı maddeler aslında ROADMAP/repo'da çoktan yapılmış:
- `GET /api/orders` "eksik" görünüyordu — `siparislerim/page.tsx` Server Component, doğrudan Prisma'dan çekiyor (RPC'ye gerek yok).
- `uploads.ts` magic-bytes yapıyor (PDF/JPEG/PNG/WEBP signature kontrolü). Eksik değil.
- `.github/workflows/ci.yml` zaten lint + typecheck + vitest + scenarios çalıştırıyor.
- Default admin parolası — `scripts/change-admin-password.ts` Faz 1.5'te eklendi.

**Testler:** `npx vitest run` → **64/64 başarılı** (önceki 59 + 5 yeni cron-auth). `npx tsc --noEmit` → temiz.

**Deploy notu:** Vercel'de `CRON_SECRET` secret'ı eklendiğinde cron'lar otomatik çalışır. Self-hosted'da harici bir scheduler (cron + curl `Authorization: Bearer ...`) ile aynı endpoint'ler tetiklenebilir.

---

---

## FAZ 7 — Adres İl/İlçe + Admin Kullanıcı Anonymize ✅ Tamamlandı (2026-04-26)

**Genel kural** (Faz 7-12 hepsi için): Admin paneli zaten yoğun; her yeni form/sayfa **sade** kalmalı. Form alanları minimum, opsiyoneller "Gelişmiş" toggle altına, bulk action'larda "kaç kayıt etkilenecek" preview'ı.

- [x] **7.1** Türkiye **81 il + 973 ilçe** statik dataset — `src/lib/turkey-locations.ts` + `getProvinces()/getDistricts()/isValidProvince()/isValidLocation()` helper'ları.
- [x] **7.2** Yeni `LocationPicker` component (`src/components/location-picker.tsx`) — il değişince ilçe sıfırlanır + filtrelenir. Eski (TR listesi-dışı) değerler "(eski) X" diye gösterilir, form sıfırlanmaz. 3 form'a entegre edildi:
  - `src/components/address-manager.tsx` (hesabım/adresler)
  - `src/app/(storefront)/odeme/page.tsx` (checkout)
  - `src/app/(storefront)/bayi-basvuru/page.tsx`
- [x] **7.3** Schema migration **gerekmedi** — `Address.district String` zaten vardı. `validations.ts` güncellendi:
  - `addressSchema` + `addressUpdateSchema` `.refine(isValidLocation)` ile TR-listesi içi olmaya zorla
  - `orderCreateSchema.shipping` aynı kontrol
  - `dealerApplySchema` aynı kontrol
  - PATCH için endpoint'te merge sonrası ekstra kontrol (`/api/account/addresses/[id]`)
- [x] **7.4** Admin kullanıcı silme:
  - Yeni helper `src/lib/user-anonymize.ts` — `anonymizeUser(userId)` (self + admin pathlerinde ortak)
    - email → `deleted-<rand>@example.invalid`, name "Silinen Kullanici", phone null, password random
    - addresses kişisel alanlar boşaltılır (FK orders üzerinden korunmalı)
    - dealer (varsa) → SUSPENDED + sirket bilgileri silinir
    - cartItems + passwordResetToken silinir
  - `/api/admin/users/[id]` DELETE: siparişi varsa `?mode=anonymize` zorunlu, yoksa hard delete (cascade)
  - `/api/account/delete` self-delete refactor edildi (helper'ı kullanıyor — duplicate kod kaldırıldı)
  - UI (`user-actions.tsx`): siparişi varsa "Hesabi Anonimlestir" butonu; yoksa "Kullaniciyi Sil"
  - Yeni audit action `USER_ADMIN_DELETE`
- [x] **Test:** `tests/turkey-locations.test.ts` — 13/13 (data integrity + schema validation senaryoları). Toplam **77/77 vitest yeşil**.

---

## FAZ 8 — Bayi Ödeme Yöntemi (Admin Tanımlı) ✅ Tamamlandı (2026-04-26)

- [x] **8.1** Schema: `DealerPaymentTerms` enum (`OPEN_ACCOUNT`, `PREPAID`) + `Dealer.paymentTerms` (default `OPEN_ACCOUNT`). Migration `20260426120000_add_dealer_payment_terms` (manuel SQL — `searchDoc` generated column drift'i sebebiyle `migrate dev` interactive olamadı; `db execute` + `migrate resolve --applied`).
- [x] **8.2** Admin bayi formu (`src/components/admin/dealer-actions.tsx`):
  - "Odeme Modu" dropdown — PREPAID/OPEN_ACCOUNT
  - PREPAID seçilince `creditLimit` input disable + 0'a sıfırlanır
  - Approve + saveDetails akışları paymentTerms gönderiyor
  - Bayi detay sayfasında (`/admin/bayiler/[id]`) "Odeme & Cari Durum" kartı PREPAID için limit/bakiye/kullanılabilir alanlarını "—" gösterir
  - Validation refine: PREPAID + creditLimit > 0 reddedilir (`dealerStatusUpdateSchema`, `dealerEditSchema`)
- [x] **8.3** Checkout (`src/app/(storefront)/odeme/page.tsx`):
  - "Acik Hesap" seçeneği yalnızca `dealerPaymentTerms === "OPEN_ACCOUNT"` ise görünür
  - `next-auth` session/JWT'ye `dealerPaymentTerms` alanı eklendi (`src/lib/auth.ts`, `src/types/next-auth.d.ts`); session callback fresh fetch ediyor (admin değişiklikleri anında yansır)
- [x] **8.4** API koruma:
  - `/api/orders` POST — PREPAID dealer OPEN_ACCOUNT denerse 403 `PREPAID_DEALER_OPEN_ACCOUNT_FORBIDDEN`
  - `/api/dealer/bulk-order/submit` — 403 `PREPAID_DEALER_BULK_FORBIDDEN`
- [x] **8.5** Bayi paneli görünüm (`/bayi` dashboard):
  - "Firma Bilgileri" kartında **Odeme Modu** satırı; PREPAID için limit/bakiye/kullanılabilir gizli, OPEN_ACCOUNT için hepsi gösterilir
  - Sidebar (`src/components/bayi/sidebar.tsx`) — PREPAID dealer'a "Cari Ekstre" + "Toplu Siparis" link'leri filtrelenir
  - Sayfa-level guard: `/bayi/ekstre` ve `/bayi/toplu-siparis` PREPAID için `redirect("/bayi")` (Next 16 streaming context'inde meta-refresh ile çalışır)
- [x] **Test:**
  - `tests/dealer-payment-terms.test.ts` — 5/5 (validation refine senaryoları)
  - `scripts/test-faz8-payment-terms.ts` — gerçek DB + canlı dev server + NextAuth login ile **10/10** (session paymentTerms, /api/orders 403, bulk-order 403, page-level redirect NEXT_REDIRECT marker'ı)
  - Tüm vitest: **82/82** yeşil, `tsc --noEmit` temiz

---

## FAZ 9 — Kategori Bazlı İskonto Scope ✅ Tamamlandı (2026-04-26)

- [x] **9.1** Schema: `DiscountScope.CATEGORY` enum, `DealerDiscount.categoryId` (nullable FK → categories, ON DELETE SET NULL), unique constraint genişletildi (`(dealerId, scope, productId, categoryId, publisherId, discountGroup)`). Migration `20260426140000_add_discount_category_scope` (manuel SQL — `ALTER TYPE ADD VALUE BEFORE 'PUBLISHER'` + `ADD COLUMN` + index swap).
- [x] **9.2** Pricing engine (`src/lib/pricing.ts`):
  - `PricedProductInput` + `DiscountRuleInput` ↑ `categoryId`
  - `SCOPE_PRIORITY`: PRODUCT(1) > CATEGORY(2) > DISCOUNT_GROUP(3) > PUBLISHER(4) > GLOBAL(5)
  - `pickBestRule` CATEGORY case
  - `priceProductsForDealer` product select'inde `categoryId`
  - `applyDealerPricing` generic constraint genişletildi
  - **Tüm caller'lar güncellendi** (10 dosya): orders, bulk-order parse/submit, cart/refresh, products/[id], admin/discounts simulate/copy, ürünler/yayınevleri/kategoriler sayfaları, anasayfa
- [x] **9.3** Admin iskonto matrix UI (`src/components/admin/discount-manager.tsx`):
  - "Kategori" SCOPE_LABEL (emerald badge)
  - "Tek Kural Ekle" formuna kategori dropdown (scope === "CATEGORY")
  - "Mevcut Kurallar" `targetLabel` CATEGORY → `r.category.name` gösterir
  - `/admin/iskontolar/[id]/page.tsx` Categories prop'unu çekip geçiriyor
  - `discountRuleSchema` (validations.ts) CATEGORY enum'u kabul ediyor
  - POST `/api/admin/discounts` CATEGORY için `categoryId` gerekli (yoksa 400)
- [x] **9.4** Excel template + bulk import:
  - `/api/admin/discounts/template` — yeni "Kategoriler" sayfası (slug, id, name, type) + ana sayfada `categorySlug` + `categoryId` kolonları
  - `/api/admin/discounts/upload` — CATEGORY satır tipi, `categorySlug` → `categoryId` lookup, validation
- [x] **9.5** Bayi paneli `/bayi/iskontolar` — CATEGORY scope sıralaması + kategori adı gösterimi.
- [x] **Test:**
  - `tests/pricing.test.ts` — 15/15 (önceki 12 + 3 yeni: PRODUCT > CATEGORY öncelik, CATEGORY > DG/PUB/GLOBAL, kategorisi yok ignore, farklı kategori ignore)
  - `scripts/test-faz9-category-scope.ts` — gerçek DB **6/6** (CATEGORY match, listPrice * 0.75, PRODUCT öncelik, kategorisi yok ignore)
  - `npx vitest run` — **85/85**, `tsc --noEmit` temiz

---

## ~~FAZ 10 (eski)~~ — İptal ❌

Kullanıcı 2026-04-26 öğleden sonra: "fiyat gizleme istemiyoruz, admin bayilere özel fiyatlar tanımlıyor — bayi bunu görmeli". Mutlak `DealerProductPrice` override de gerek görülmedi: % iskonto + Faz 9 CATEGORY scope yeterli kullanım esnekliği veriyor. Eğer ileride mutlak fiyat ihtiyacı doğarsa ayrı bir faz olarak eklenir.

Yeni öncelik: **admin için toplu işlemler**. Kullanıcı netleştirdi: 1000 ürünün KDV'sini değiştirmek tek tek yapılırsa zaman katili — bu tarz tüm akışlar basitleştirilmeli.

---

## FAZ 10 — Ürün Multi-select + Alan Bazlı Toplu Güncelleme ✅ Tamamlandı (2026-04-26)

**Kullanıcı senaryoları:**
- "Universal'ın tüm ürünlerinin KDV'sini %18'den %20'ye çıkar" → ✅ tek modal, tek tıkla
- "50 ürünü stoktan düş" → ✅ checkbox + bulk update
- "200 ürünü kategori X'e taşı" → ✅ kategori dropdown bulk update
- "Eski seri ürünleri yayından kaldır" → ✅ "Yayindan Kaldir" butonu

**Yapılanlar:**

- [x] **10.1+10.2** **`ProductsTable` client component** (`src/components/admin/products-table.tsx`):
  - Checkbox kolonu + "Tümünü seç" header
  - Seçili satırlar `bg-brand-gold-light/10` ile vurgulanır
  - Sticky footer aksiyon barı: **{N} secildi** + "Toplu Guncelle" / "Yayina Al" / "Yayindan Kaldir" / "Sil" / "Secimi temizle"
  - Mobile fallback: kart liste (multi-select desktop-only)
- [x] **10.3** **`ProductsBulkUpdateModal`** (`src/components/admin/products-bulk-update-modal.tsx`):
  - Tek dropdown: "Hangi alan?" — Fiyat / Eski Fiyat / KDV / Stok / Kategori / Yayinevi / Iskonto Grubu
  - Alana göre dinamik input (sayı / kategori dropdown / yayınevi dropdown / metin)
  - Opsiyonel alanlar için "Bu alani temizle" checkbox (oldPrice, kategori, yayınevi, grup için null atama)
  - "X urune ayni yeni deger uygulanir" preview header
- [x] **10.4** **Bulk endpoint'ler:**
  - `POST /api/admin/products/bulk-update` — `{ productIds[], patch: { price?, oldPrice?, vatRate?, stockQuantity?, categoryId?, publisherId?, discountGroup?, isPublished? } }`. Tek `updateMany` transaction, FK validation (kategori/yayınevi var mı). Audit `PRODUCT_BULK_UPDATE`.
  - `POST /api/admin/products/bulk-delete` — `{ productIds[] }`. Sipariş referansı varsa soft (isPublished=false + stok=0), yoksa hard (cascade dealerDiscount + cartItem + productImage + product). Audit `PRODUCT_BULK_DELETE`.
- [x] **10.5** Validation + güvenlik:
  - bulk-update max 1000 ID, bulk-delete max 500 ID
  - `requireRole("ADMIN")` gate
  - Boş patch reddedilir, FK olmayan kategoriId/publisherId reddedilir
  - Audit metadata: count, fields, sample IDs (ilk 20)
- [x] **Server page güncellendi** (`src/app/admin/urunler/page.tsx`): server component data fetch + `<ProductsTable>` client'ı render eder. Mevcut "Toplu Yukle" + "Yeni Urun" linkleri korundu, mevcut arama formu korundu.
- [x] **Audit:** `USER_ADMIN_DELETE`, `PRODUCT_BULK_UPDATE`, `PRODUCT_BULK_DELETE` action'ları eklendi (`src/lib/audit.ts`).
- [x] **Test:**
  - `scripts/test-faz10-bulk-products.ts` — gerçek DB + canlı dev server + admin login ile **15/15** (KDV/fiyat/isPublished bulk update, validation, hard delete, audit log)
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz

---

## FAZ 11 — Yayınevi/Kategori Bazlı Toplu Fiyat + Import Upsert ✅ Tamamlandı (2026-04-26)

- [x] **11.1** `/admin/urunler/toplu-fiyat` sayfası + `BulkPriceForm` component:
  - **Filtre**: yayınevi + kategori + iskonto grubu + yayın durumu (en az biri zorunlu — tüm ürünleri yanlışlıkla değiştirme koruması, 400 döner)
  - **5 mod**: `set` (tek fiyat) / `percent_increase` / `percent_decrease` / `fixed_increase` / `fixed_decrease`
  - **`minPrice` taban koruması**: %azalt/sabit-azalt modlarında alt sınır (negatif fiyat olmaz)
  - **3 adımlı UX**: 1) Hangi ürünler? 2) Ne yapalım? 3) Önizleme (kart: Etkilenecek/Yeni min/max/ort) + ilk 20 örnek tablo (mevcut → yeni + ↑/↓ ok)
  - **Önizleme zorunlu** sonra "Uygula" — yanlışlık riski azalır
  - Endpoint `POST /api/admin/products/bulk-price`:
    - `dryRun=true` → preview (etkilenecek count + summary + sample); DB değişmez
    - `dryRun=false` → uygula (set: tek `updateMany`; percent/fixed: bucket'lara göre transaction)
    - `MAX_AFFECTED=50000` üst sınır
    - Audit `PRODUCT_BULK_PRICE_UPDATE` (filter, mode, value, summary, sampleIds)
- [x] **11.2** **Bulk-import upsert mode**:
  - `?mode=upsert` query → `nopId` match olanları update, yokları insert
  - DryRun preview'da `willInsert` + `willUpdate` ayrımı + her satır için `action: "insert" | "update"` badge
  - UI'da radio: "Sadece ekle" / "Ekle veya Güncelle"
  - `name`/`nameEn`/`sku`/`price`/`oldPrice`/`vatRate`/`stock`/`publisher`/`category`/`anaTur`/`productType`/`language`/`discountGroup`/`isPublished` update edilir; `slug` ve `hasImage` korunur (mevcut görselleri kaybetmemek için)
  - Default: `insert` (geriye uyum). Audit metadata'sına `mode`/`inserted`/`updated` eklendi.
- [x] **Test:**
  - `scripts/test-faz11-bulk-price.ts` — admin login → 5 ürün → set/percent_increase/percent_decrease/fixed_increase/minPrice/empty filter/audit. **17/17**
  - `scripts/test-faz11-bulk-import-upsert.ts` — admin login → 2 mevcut + 1 yeni Excel → dryRun (1+2) → apply (1+2) → DB doğrulama → insert mode error. **12/12**
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz
- [x] Audit: `PRODUCT_BULK_PRICE_UPDATE` action eklendi.

---

## FAZ 12 — Sipariş + Bayi Toplu İşlemler ✅ Tamamlandı (2026-04-26)

- [x] **12.1** Sipariş listesi (`/admin/siparisler`) multi-select + bulk status:
  - `OrdersTable` client component (checkbox kolonu + sticky bar + modal)
  - `OrdersBulkStatusModal`: status (APPROVED/PROCESSING/SHIPPED/DELIVERED/CANCELLED) + kargo firması (9 enum) + tahmini teslim + admin notu
  - `POST /api/admin/orders/bulk-status` (max 500 ID): her sipariş için ayrı transaction (partial-success). CANCELLED → stok geri yükleme + ledger entry (open-account için). SHIPPED → shippedAt, DELIVERED → deliveredAt + paymentStatus PAID. OrderEvent kayıt + email cascade `after()`.
- [x] **12.2** Bayi listesi (`/admin/bayiler`) multi-select + bulk approve:
  - `DealersTable` client component (paymentTerms + creditLimit kolonları, koşullu sticky bar)
  - "Toplu Onayla" butonu sadece PENDING bayi sayısı > 0 ise aktif
  - `DealersBulkApproveModal`: paymentTerms (PREPAID = limit 0) + creditLimit + notes
  - `POST /api/admin/dealers/bulk-approve` (max 200): sadece PENDING bayilere uygulanır, diğerleri silently skip + skipped count rapor edilir. Email queue + audit `DEALER_BULK_APPROVE`.
- [x] **12.3** **Bulk credit adjust:**
  - "Limit Ayarla" butonu sadece APPROVED + OPEN_ACCOUNT bayi sayısı > 0 ise aktif
  - `DealersBulkCreditModal`: 5 mod (set / %± / sabit ±) + minLimit floor
  - `POST /api/admin/dealers/bulk-adjust-credit` (max 500): yalnız APPROVED + OPEN_ACCOUNT bayilere uygulanır, PREPAID + non-APPROVED silently atlanır. dryRun + apply, bucket-bazlı transaction. Audit `DEALER_BULK_CREDIT_ADJUST`.
- [x] Server page'ler güncellendi (siparisler + bayiler) — data fetch + client wrapper.
- [x] Audit: `ORDER_BULK_STATUS_CHANGE`, `DEALER_BULK_APPROVE`, `DEALER_BULK_CREDIT_ADJUST` eklendi.
- [x] **Test:**
  - `scripts/test-faz12-bulk-orders-dealers.ts` — admin login → 3 sipariş bulk APPROVED → SHIPPED+ARAS → 3 PENDING + 1 APPROVED bayi (3 onay/1 skip) → credit dryRun → set 8000 → PREPAID skip → audit. **21/21**.
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz

---

## FAZ 13 — Kupon + Yorum + Kullanıcı Toplu ✅ Tamamlandı (2026-04-26)

- [x] **13.1 Kupon toplu üretme**:
  - `POST /api/admin/coupons/bulk-create` — codeTemplate (`SUMMER-{NNN}` veya `{N}` veya pattern yoksa `-001` suffix), startNumber, count (max 500), kind/value/minSubtotal/maxUses/validUntil/isActive
  - DryRun + apply: önizlemede `total/willCreate/conflicts/sample` döner; tüm kodlar zaten varsa 409
  - Çakışma: zaten var olan kodlar silently atlanır, sample preview'da listelenir
  - `CouponBulkModal` component (kupon-manager üst satırına "+ Toplu Üret" butonu)
  - 2 adımlı UX: form → Önizle (`willCreate=N / total=M`) → Üret
- [x] **13.2 Yorum bulk moderation**:
  - `POST /api/admin/reviews/bulk-status` — `{ reviewIds[], action: "APPROVED" | "REJECTED" | "DELETE" }`
  - `ReviewModeration` genişletildi: per-yorum checkbox + "Tümünü seç" + sticky bar (Yayina Al / Gizle / Sil); tek-yorum butonları geriye uyum
- [x] **13.3 Kullanıcı bulk delete**:
  - `POST /api/admin/users/bulk-delete` — `{ userIds[], mode: "auto" | "anonymize_all" | "hard_only" }`
  - 3 mod: `auto` (siparişsiz=hard, siparişli=anonymize), `anonymize_all` (KVKK soft tercih), `hard_only` (yalnız siparişsiz)
  - Korumalar: kendi hesabı, ADMIN, onaylı bayi (cari riski) silently skip
  - `anonymizeUser()` (Faz 7) yeniden kullanıldı
  - `UsersTable` — checkbox kolonu (admin/self için disabled), sticky bar (Akilli Sil / Anonimleştir / Kalıcı Sil)
- [x] Audit: `COUPON_BULK_CREATE`, `REVIEW_BULK_STATUS`, `USER_BULK_DELETE` action'ları + `coupon`, `review` entity'leri eklendi.
- [x] **Test:**
  - `scripts/test-faz13-bulk-misc.ts` — admin login → kupon dryRun + apply + conflict 409 → yorum bulk APPROVE/REJECT/DELETE → user bulk-delete (3 hard + 1 anonymize + self/admin/approved-dealer skip) → audit. **24/24**
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz

---

## FAZ 14 — Görsel Toplu Yükleme ✅ Tamamlandı (2026-04-26)

ZIP yerine **multi-file** kabul (browser file input `multiple`) — kullanıcı klasörden N dosya seçer, ZIP açma maliyeti yok, ek dependency yok.

- [x] **14.1** `POST /api/admin/products/bulk-upload-images?dryRun=1`:
  - FormData `files[]` (max 500 dosya, 5MB/dosya)
  - Filename → SKU (uzantısız, son segment) → DB `Product.sku` lookup
  - 4 status: `matched` / `unmatched` / `invalid_mime` / `too_large` (apply'da ek `magic_mismatch`)
  - Magic-bytes doğrulaması: JPEG `FF D8 FF`, PNG `89 50 4E 47…`, WEBP `RIFF…WEBP`, GIF `GIF` (uploads.ts ile aynı pattern)
  - Aynı SKU'ya birden fazla dosya: silently kabul edilir (her biri ayrı `pictureId` + `displayOrder`), `duplicates` listesinde uyarılır
- [x] **14.2** `BulkImageForm` UI:
  - Multi-file picker + toplam boyut bilgisi
  - Önizleme: 4 stat kartı (Toplam / Eşleşti / SKU yok / Geçersiz) + duplicate uyarısı + ilk 100 satır tablo (status badge)
  - Önizleme zorunlu, sonra "Yükle (N)" butonu
- [x] **14.3** Apply path:
  - Magic-bytes son kontrol (kullanıcı MIME yalanı bypass'ı engeli)
  - Her başarılı dosya için `ProductImage` + `pictureId` + `displayOrder` artırılır (mevcut görselleri ezmez)
  - Touched ürünler için tek `updateMany` ile `hasImage=true`
  - Audit `PRODUCT_BULK_IMAGE_UPLOAD` (saved + duplicates + errors metadata)
- [x] **14.4** `/admin/urunler` sayfasına "Toplu Görsel" linki eklendi.
- [x] **Test:**
  - `scripts/test-faz14-bulk-images.ts` — admin login + 3 test ürünü → 5 dosya (2 eşleşme + 1 unmatched + 1 invalid_mime + 1 duplicate SKU) → dryRun count'lar + apply DB'de productImage/hasImage doğrulaması + audit. **19/19**
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz

### Kullanıcı senaryoları çözüldü
- **"Yeni sezon görselleri klasördeki 200 dosyayı topluca yükle"**: dosya adları SKU.jpg → "Toplu Görsel" → tüm dosyaları seç → Önizle (matched/unmatched stat) → Yükle. **2 tıkla**.
- **"Aynı ürün için 2 görsel"**: SKU.jpg + SKU.png → otomatik 2. görsel olarak eklenir, mevcut görseli ezmez.

---

## FAZ 15 — SKU → ISBN (UI Label-Only Rename) ✅ Tamamlandı (2026-04-26)

Schema'ya **dokunulmadı** (`Product.sku`, `OrderItem.productSku` field adları kalır). Sadece kullanıcıya görünen yerler değişti. Risk düşük, regresyon yok.

- [x] **15.1** UI labels (19 dosya):
  - Admin: `product-form.tsx` ("SKU *" → "ISBN *"), `products-table.tsx`, `discount-manager.tsx`, `discount-simulator.tsx`, `discount-bulk-picker.tsx`, `bulk-price-form.tsx`, `bulk-image-form.tsx` (status label + stat + duplicate uyarısı + table header), `siparisler/[id]`, `urunler/[id]`, `urunler/toplu-yukleme/bulk-import-form.tsx`, `urunler/toplu-gorsel/page.tsx`
  - Storefront: `urunler/[slug]/page.tsx`, `sepet/page.tsx`, `karsilastir/page.tsx`, `quick-view-modal.tsx`, `product-filters.tsx`, `invoice-view.tsx`
  - Bayi: `toplu-siparis/bulk-order-form.tsx`
- [x] **15.2** Excel templates:
  - `/api/admin/products/template` — header "sku" → "isbn", örnek değer ISBN-13 formatı
  - `/api/dealer/bulk-order/template` — header "SKU" → "ISBN", intro + Açıklama sayfası güncel
  - `/api/admin/accounting/export` — fatura sütunu "SKU" → "ISBN"
  - `src/lib/adapters/accounting.ts` ITEM_HEADERS aynı
- [x] **15.3** Bulk-import + bulk-order parse — **hem "isbn" hem "sku" başlığını kabul** (geriye dönük uyum):
  - Header validation `candidate.includes("sku") || candidate.includes("isbn")`
  - Lookup: `idx("sku") >= 0 ? idx("sku") : idx("isbn")`
  - Hata mesajı güncel: "Basliklarda 'isbn' (veya 'sku') zorunlu"
- [x] **15.4** Schema field adları (`sku`, `productSku`) ve internal kod referansları DOKUNULMADI — Prisma migration yok, regresyon yok.
- [x] **Test:**
  - `scripts/test-faz15-isbn-rename.ts` — admin login → "isbn" header'lı Excel dryRun + apply → DB'de `Product.sku` field'ına kaydedildi → admin ürün detay UI'da "ISBN:" görünür/"SKU:" görünmez → ürün listesi search "ISBN" placeholder → eski "sku" header backwards-compat. **8/8**.
  - `scripts/test-faz11-bulk-import-upsert.ts` (eski "sku" başlık) — **12/12** stabil
  - `npx vitest run` — **85/85** stabil
  - `npx tsc --noEmit` — temiz

### Kullanıcı kazancı
- Yeni indirilen Excel template'lerin başlığı "isbn" — kullanıcı yeni alışkanlık edinir
- Mevcut "sku" başlıklı eski Excel'ler **kırılmaz** — backwards-compat
- UI'da "SKU:" geçen tüm yerlerde "ISBN:" görünür (admin form/list/detay, storefront ürün detay/sepet/karşılaştır, bayi toplu sipariş, fatura)
- [ ] **15.5** Test fixture'lar ve regresyon: vitest + scenarios yeşil kalmalı.

---

## FAZ 16 — Güvenlik Denetimi & Sertleştirme ✅ Tamamlandı (2026-04-26)

Hacker bakışıyla full saldırı yüzeyi tarandı. Bulgular OWASP framework'üne göre önceliklendirildi ve kapatıldı.

### P0 (Kritik) — Open Redirect ✓
- **Bulgu**: `/giris?callbackUrl=https://evil.com` ile harici domain'e yönlendirme. `/giris/page.tsx`, `/kayit/page.tsx`, `login-gate.tsx` callbackUrl'i doğrulamadan kullanıyordu.
- **Fix**: `src/lib/safe-callback.ts` helper (relative path zorunlu, `//`, `/\\`, `/[a-z]+:` pattern'leri reddet); 3 callsite'da uygulandı.
- **Test**: `tests/safe-callback.test.ts` — 10/10 (relative kabul, absolute/protocol-relative/javascript:/backslash bypass tümü reddedildi).

### P1 — Dealer Belge Public URL Açığı ✓
- **Bulgu**: Vergi levhası, sicil gazetesi gibi gizli belgeler `public/uploads/dealer-documents/` altında — Next.js public dizin → direct URL erişimi açık. Dosya adı random hex (24 char) olsa bile bayi paneli filename'i API response'unda dönüyor → URL leak edilebilir veya brute-force teorik mümkün.
- **Fix**: Dosyalar `private/uploads/dealer-documents/`'a taşındı (8 mevcut dosya `scripts/migrate-dealer-docs-to-private.ts` ile migrate edildi). `storeUpload` artık private path'e yazar. Yeni endpoint `/api/dealer/documents/[id]/download` — auth gerekli (admin veya sahip-bayi), filename pattern kontrolü ile path traversal koruması, 404 ile varlık sızdırmaz. UI link'leri güncellendi (`dealer-documents.tsx`, register/admin endpoint response'ları).
- **`.gitignore`**: `/private/` + `/public/uploads/` eklendi.

### P1 — Register Email Enumeration ✓
- **Bulgu**: `/api/auth/register` — var olan email için 409 + "Bu email zaten kayitli" mesajı sızıntı.
- **Fix**: Var olan (guest-upgrade dışı) email için artık **generic 201 response** + audit log. Rate limit 10→5/saat (brute-force maliyetini artır). Saldırgan response farkı göremez.

### P1 — Forgot Password Timing ✓
- **Bulgu**: Yok-email için sorgu hızlı, var-email için token create + email queue sürer — timing attack ile enumeration mümkün.
- **Fix**: `timingSafeNoop()` — yok-email path'inde 50-150ms artificial work (random delay + crypto.randomBytes). Manuel curl ile doğrulandı: yok-email ~200-470ms (var-email ile yakın).

### P2 — JSON-LD XSS Defense-in-Depth ✓
- **Bulgu**: `urunler/[slug]/page.tsx` `dangerouslySetInnerHTML={JSON.stringify(jsonLd)}` — ürün adında `</script><script>...` olursa XSS.
- **Fix**: `<>&` karakterleri unicode escape (`\\u003c`, `\\u003e`, `\\u0026`). Ürün admin tarafından eklense de defense-in-depth.

### Onaylanan iyi durumlar (rapor sonucu)
- Coupon validate **zaten rate-limited** (20/saat/IP) — false alarm
- Address IDOR yok (`userId` ownership check var)
- Stock race condition zaten kapatılmış (Faz 1)
- Mass assignment Zod ile bloklu
- Admin endpoint'leri tümü `requireRole("ADMIN")` ile başlıyor
- File upload magic-bytes ✓
- Cron auth timing-safe ✓
- Reset/email-verify token entropy 256-bit, single-use, expiry ✓

### Test
- `tests/safe-callback.test.ts` — 10/10
- `scripts/test-security-fixes.ts` — public 404, doc 401, register generic, forgot password, sayfa render. **6/6**.
- `npx vitest run` — **95/95** stabil
- `npx tsc --noEmit` — temiz

---

## Not edilen ikincil bulgular (gerektiginde faza eklenir)

- NextAuth v5 **beta** surumu — stable'a ciktiginda yukselt
- Mobile: Sepet sayfasinda sticky summary tablet'te header'la overlap olabilir — gozle dogrula
- Volume breaks vs fixed % iskonto — gelecek feature, su an fixed % isliyor
- Turkish FTS: `search.ts`'de `websearch_to_tsquery('turkish', ...)` — ozel karakterlerle davranis test edilmeli
- `.env` dosyasi `.gitignore`'da mi? Dogrula.

---

## Bölüm 3 devir notu (2026-05-06)

Bölüm 2 sonu — kod tabanı production-ready. Aşağıdakiler **Bölüm 3** kapsamında:

### Faz 4 entegrasyonları (canlıya çıkış öncesi)
- **4.1 SMTP/Resend** canlı doğrulama (Bölüm 1: misconfig tespiti aktif)
- **4.2 Iyzico/Param** sandbox + 3DS + iade + signature verify
- **4.3b Shipentegra** adapter + webhook + cron sync
- **4.4 Upstash Redis** rate-limit (in-memory'den geçiş — Bölüm 1 P1-DEPLOY-2)
- **4.6 Sentry/Logtail** observability (`error-log.ts` + slack webhook)
- **4.7 Vercel deploy** — proje setup + cron + custom domain + SSL + CI

### Final QA (5 günlük sprint)
- **E2E Playwright golden path** × 3 persona (misafir/üye/bayi)
- **Loading/error/404** patikası tüm route'larda görsel doğrulama
- **Responsive** (375/768/1280) — sticky overlap, focus trap, scroll lock
- **A11y** — heading sırası, aria-label, focus ring, klavye nav, NVDA+VoiceOver smoke
- **Performance** — Lighthouse 90+ tüm sayfalarda; Next 16 turbopack bundle analysis
- **Coupon 21. denemede 429** + forgot-password 20 timing ölçüm + callback bypass 10 payload (kanıt)

### Bölüm 1 + Bölüm 2 P2/P3 batch fix
- P2-DB-1: `searchDoc` schema sync (`Unsupported("tsvector")`)
- P2-DB-2: Order soft-delete (`deletedAt`) + admin endpoint update
- P2-DB-3: `DealerLedger(dealerId, createdAt DESC)` composite index
- P2-BAYI-1: `/bayi/siparisler` pagination
- P3-DB-1..4: `AuditLog(action)`, `Review(productId,status)`, `OrderEvent(actorId)`, `Dealer(status)` index'leri
- P3-API-1..4: `bulk-image-upload` rate-limit, SUSPENDED dealer PATCH 409, bulk last-admin guard, audit metadata trim
- P3-A05-1: nonce-based CSP (Next.js destek bekleniyor)
- P3-A09-1: `audit.ts` recursive sanitize WeakSet + max depth 8
- P3-BAYI-1: `dealer/documents` upload `origName` filename normalize

### Bölüm 1'in 2 bekleyen P1'i
- **P1-PAGE-2**: `emailVerified === null` user için login engeli (UX kararı bekliyor)
- **P1-DEPLOY-2**: Redis rate-limit (Faz 4.4 ile)

### Yapısal kararlar (UX'ten beklenen — Bölüm 3 başında)
- emailVerified zorunluluğu CUSTOMER login için
- Order soft-delete + 10 yıl arşiv saklama (Türkiye yasası)
- Bayi statement pagination limit
- NextAuth v5 stable'a yükseltme zamanlaması

### Bölüm 2 dışı kalan eski Bölüm 2 devir notu kalıntıları (Bölüm 1 sonu yazılmıştı):

### Kapsam dışı kalan kod alanları
- **`src/app/admin/**`** ve **`src/app/api/admin/**`** — 60+ endpoint, 30+ sayfa. Mass-assignment, IDOR, audit, rol-sızıntısı, bulk endpoint güvenlik vektörleri.
- **`src/app/bayi/**`** panel UI sayfaları — dealer API'lar denetlendi; UI sayfaları henüz değil.

### Bekleyen Bölüm 1 P1'leri
- **P1-PAGE-2** (UX kararı bekliyor): `emailVerified === null` user için login engeli. Şu an doğrulanmamış email ile siparişe izin var. Karar: zorla mı, opsiyonel uyarı mı?
- **P1-DEPLOY-2**: Roadmap 4.4 — Upstash Redis rate-limit (in-memory'den geçiş). Faz 4'e bağlı.

### Bekleyen Bölüm 1 P2/P3'leri (kod düzeyinde, Bölüm 1'in P1'lerinden sonra)
- P2-LIB-1 `safe-callback.ts` decode-once + control-char rejection
- P2-LIB-2 `addressUpdateSchema` partial validation gap
- P2-LIB-3 `uploads.ts` magic-byte streaming
- P2-API-1 dealer/documents PATCH/DELETE'de `requireApprovedDealer` kullan
- P2-API-2 dealer/bulk-order/submit unhandled DB error → 500 stack leak
- P2-PAGE-1..4 loading skeletons (kategoriler, yayinevleri, kargo-takip/[no], siparis-takip)
- P3-1..10 — `docs/PRODUCTION_AUDIT_P1.md`#P3 listesi

### Security tur 3 (Faz 17 sonrası vektörler)
- JWT staleness/admin downgrade race (`api-auth.ts:requireRole` JWT-based; admin demote durumunda eski JWT kullanılıyor)
- File upload polyglot (PDF içine JS embed) advanced check
- SSRF — Vercel Blob fetch'inde redirect follow / external URL guard
- WebSocket / SSE varsa origin check (yok şu an)
- Audit log circular ref guard (`audit.ts:131` recursive sanitize)

### Entegrasyon (Faz 4)
- 4.1 SMTP/Resend canlı doğrulama (artık misconfig tespiti var — Bölüm 1)
- 4.2 Iyzico/Param sandbox + signature verify
- 4.3b Shipentegra adapter
- 4.4 Upstash Redis rate-limit
- 4.6 Sentry/Logtail
- 4.7 Vercel deploy + cron + custom domain

### Operasyonel deploy runbook (canliya cikis ON KOSULU)
1. `NEXTAUTH_SECRET` üret (32+ char) → prod env
2. `NEXTAUTH_URL` prod domain (Bölüm 1 fix'i ile zorunlu)
3. **`BRAND_TAX_OFFICE`, `BRAND_TAX_NUMBER`, `BRAND_MERSIS_NUMBER`** doldur (yasal yükümlülük; Bölüm 1 P1-DEPLOY-1)
4. Admin sifresini degistir (`scripts/change-admin-password.ts`)
5. `ADMIN_EMAIL` gerçek kutu
6. `CRON_SECRET` 16+ char
7. `RESEND_API_KEY` + domain verify (sandbox fallback artık prod'da yok)
8. `KOLAYBI_API_KEY` + `KOLAYBI_CHANNEL` (e-fatura entegrasyonu varsa)
9. `ENABLE_MOCK_PAYMENTS` boş bırak (prod'da kapalı)
10. `scripts/check-prod-env.ts` çalıştır + temiz görmeden deploy yapma

---

## Degisiklik gunlugu

- **2026-04-24:** Roadmap olusturuldu (full audit sonrasi).
- **2026-04-24 (aksam):** Kargo takibi A fazi tamamlandi (OrderEvent + carrier enum + timeline + email); B fazi (Shipentegra) ileride yapilacak.
- **2026-04-26:** Faz 6 tamamlandi — admin/bayi error boundaries, 6 loading skeleton, fatura `?print=1`, cron cleanup endpoint'leri (PaymentSession + PasswordResetToken) + `CRON_SECRET` guard + `vercel.json` schedules. 64/64 vitest yesil.
- **2026-04-26 (öğleden sonra):** Faz 7 tamamlandi — TR il+ilçe veri tabanı (81+973), `LocationPicker` component, 3 form entegrasyonu, addressSchema TR-içi validation, admin user anonymize akışı (`anonymizeUser` helper + UI). 77/77 vitest yeşil.
- **2026-04-26 (akşam):** Faz 8 tamamlandi — `DealerPaymentTerms` enum + migration, admin formu (PREPAID/OPEN_ACCOUNT toggle, limit otomatik sıfırlama), checkout + API + sidebar + page-level guard'lar, session.dealerPaymentTerms. 82/82 vitest + 10/10 e2e smoke.
- **2026-04-26 (gec):** Faz 9 tamamlandi — `DiscountScope.CATEGORY` enum + migration, pricing engine 5-seviye hiyerarşi, admin iskonto manager kategori dropdown, Excel template + upload CATEGORY desteği, bayi paneli kategori adı gösterimi. 85/85 vitest + 6/6 e2e smoke.
- **2026-04-26 (gec/2):** Plan revize — eski Faz 10 (bayi fiyat gizleme) iptal. Kullanıcı netleştirdi: admin için **toplu işlemler** önceliği. Yeni Faz 10-15 plan'ı oluşturuldu (bulk product/order/dealer/coupon/user/image management).
- **2026-04-26 (gec/3):** Faz 10 tamamlandi — `ProductsTable` multi-select + sticky bulk action bar + Bulk Update Modal, `bulk-update` ve `bulk-delete` endpoint'leri (transaction + audit + FK validation + soft/hard delete). 85/85 vitest + 15/15 e2e (admin login → KDV/fiyat/publish/delete bulk).
- **2026-04-26 (gece):** Faz 11 tamamlandi — `/admin/urunler/toplu-fiyat` sayfası (5 mod: tek fiyat / %± / sabit±, minPrice tabanı, dryRun + apply, 50K max-affected güvenliği), bulk-import `?mode=upsert` (nopId match update, slug/hasImage korunur). 85/85 vitest + 17/17 + 12/12 e2e.
- **2026-04-26 (gece/2):** Faz 12 tamamlandi — sipariş listesi multi-select + bulk status/kargo modal, bayi listesi multi-select + bulk approve + bulk credit adjust (5 mod). 3 endpoint (orders/bulk-status, dealers/bulk-approve, dealers/bulk-adjust-credit) + 3 yeni client modal + 2 server page revize. 85/85 vitest + 21/21 e2e.
- **2026-04-26 (gece/3):** Faz 13 tamamlandi — kupon toplu üretme (template + dryRun preview + conflict skip), yorum bulk moderation (APPROVE/REJECT/DELETE), kullanıcı bulk delete (3 mod: auto/anonymize_all/hard_only, self+admin+approved dealer korumaları). 3 endpoint + CouponBulkModal + UsersTable + ReviewModeration genişletildi. 85/85 vitest + 24/24 e2e.
- **2026-04-26 (gece/4):** Faz 14 tamamlandi — bulk image upload (multi-file FormData, ZIP yerine), filename → SKU eşleştirme, magic-bytes doğrulaması, dryRun + apply, duplicate SKU silently kabul, hasImage toplu update. `/admin/urunler/toplu-gorsel` sayfası + BulkImageForm. 85/85 vitest + 19/19 e2e.
- **2026-04-26 (gece/5):** Faz 15 tamamlandi — SKU → ISBN UI rename (19 dosya UI label, Excel template başlıkları, bulk-import + bulk-order parse hem "sku" hem "isbn" kabul). Schema'ya dokunulmadı, geriye dönük uyumlu. 85/85 vitest + 8/8 yeni e2e + 12/12 eski "sku" backwards-compat e2e.
- **2026-04-26 (gece/6):** Faz 16 — güvenlik sertleştirme. (1) Open redirect (callbackUrl) — `safeCallbackUrl` helper, /giris + /kayit + login-gate'te uygulandı, 10 unit test. (2) Dealer belgeleri public/uploads → private/uploads (8 mevcut dosya migrate edildi, .gitignore güncellendi); auth-gated `/api/dealer/documents/[id]/download` endpoint (admin veya sahip-bayi only, path traversal pattern kontrolü). (3) Register email enumeration — var-olan email için bile generic 201 + audit log; rate limit 10→5/saat. (4) Forgot password timing — yok-email için `timingSafeNoop` (50-150ms artificial work). (5) JSON-LD XSS koruması — `</script>` injection için `<>&` unicode escape. 95/95 vitest + 6/6 e2e.
- **2026-04-26 (gece/7):** Faz 17 — güvenlik denetimi tur 2 (derin saldırı vektörleri). (1) Email change account takeover — currentPassword zorunlu, bcrypt verify, 403 + audit. (2) Reset/verify token DB hash — SHA-256 (`token-hash.ts`), DB breach koruma; verify TTL 24h→1h. (3) Audit log auto-redact — `sanitizeAuditMetadata()` recursive helper, password/token/secret/card pattern'leri `[REDACTED]`. (4) Tracking enumeration — per-IP 30/saat rate limit + `maskShippingName()`. (5) Email template HTML injection — 8 template'te `escapeHtml()`. (6) NEXTAUTH_SECRET min 16→32. 113/113 vitest + 9/9 e2e.
- **2026-05-06:** **Bölüm 1 production audit** — storefront 31 route + public/account/dealer 33 endpoint + 36 lib modülü statik+dinamik+regresyon turu. P0 yok. 10 P1 / 11 P2 / 10 P3 bulgu (`docs/PRODUCTION_AUDIT_P1.md`, `docs/API_INVENTORY_P1.md`). Uygulanan P1 fix'leri: (1) **auth.ts timing attack** — missing-user dalında dummy bcrypt; (2) **auth.ts per-IP rate-limit** — `login:ip:<ip>` 30/15min eklendi; (3) **email.ts prod silent dryrun** — production'da SMTP eksikse `console.error` + Resend sandbox fallback yalnız non-prod'a kısıtlandı; (4) **env.ts NEXTAUTH_URL** — production'da zorunlu; (5) **register audit action** — `AUTH_REGISTER_ATTEMPT_EXISTING` yeni action; (6) **kategoriler/yayinevleri canonical** — relative → absolute URL; (7) **email-verification atomic** — invalidate+create artık tek `prisma.$transaction`; (8) **constants.ts BRAND.tax\*** — env override (`BRAND_TAX_OFFICE`/`BRAND_TAX_NUMBER`/`BRAND_MERSIS_NUMBER`). 159/159 vitest stabil + tsc temiz. P2/P3 + admin paneli + security tur 3 + entegrasyonlar **Bölüm 2**.
- **2026-05-06 (akşam):** **Bölüm 3 production audit + Faz 4 entegrasyon altyapısı** (commit `10d0db5`) — Faz 4 hesap-bağımlı tüm entegrasyonların kod tarafı + Bölüm 1+2'nin ertelenmiş P2/P3 batch fix'i + RUNBOOK + RECOVERY + final docs. **Faz 4 alt maddeleri**: (4.1 SMTP Resend canlı doğrulama → kod-hazır, 10 template escapeHtml; 4.2 Iyzico adapter PKI HMAC-SHA1 init + HMAC-SHA1 callback verify + HMAC-SHA256 webhook verify + refund + 3 route init/callback/webhook + idempotency atomic claim + Mock prod 404; 4.3b Shipentegra adapter quote/createLabel/fetchTracking + `/api/webhooks/shipping` HMAC-SHA256 + `/api/cron/sync-shipping-tracking` 30 dk; 4.4 Upstash Redis adapter env varsa REST pipeline ZADD/ZCARD sliding window + `rateLimitAsync()`; 4.6 Sentry envelope adapter DSN yoksa no-op + PII scrubber + `error-log.ts` hook; 4.7 `/api/health` endpoint + ci.yml Playwright + bolum3 smoke). **P2/P3 batch fix**: (P2-LIB-1 safe-callback decode-once + control-char + 5 yeni test; P2-API-2 dealer/bulk-order try/catch generic 500; P2-PAGE-1..4 4 yeni loading skeleton; P2-DB-2 Order.deletedAt soft-delete + index; P2-DB-3 DealerLedger composite [dealerId, createdAt DESC]; P3-API-1 bulk-image rate-limit; P3-API-2 SUSPENDED dealer 409; P3-A09-1 audit WeakSet + max depth 8; P3-BAYI-1 filename normalize; P3-DB-1..4 4 missing index AuditLog/Review/OrderEvent/Dealer). Migration `20260506190000_p2_p3_indexes_and_order_softdelete` Neon prod DB'ye uygulandı. **Operasyonel**: `docs/RUNBOOK.md` 10 maddelik pre-deploy + deploy/rollback + secret rotation + sev1/2/3 incident playbook + KVKK/DSAR; `docs/RECOVERY.md` RTO/RPO matrisi + 5 senaryo (data loss / charge-back / compromised admin / leaked secret / DB corruption) + tatbikat tablosu + iletişim plan. `.env.example` Iyzico/Shipentegra/Upstash/Sentry/Slack/BRAND_TAX_* genişletildi; `scripts/check-prod-env.ts` 8 yeni kontrol; `scripts/smoke-bolum3-final.ts` 8 endpoint smoke. **Test baseline**: vitest **164/164** ✓ (önceki 159 + 5 yeni safe-callback) + tsc temiz + npm audit fix uygulandı (hono moderate düştü; kalan 5 vuln dev-only postcss + prisma transitive — Next downgrade engelli, kabul edilmiş risk). Final docs: `docs/PRODUCTION_AUDIT_FINAL.md` + `docs/SECURITY_AUDIT_FINAL.md` (3 turun konsolide tablosu, 27/29 OWASP fix + 2 gerekçeli kabul). **Hesap-bağımlı kalan canlı doğrulamalar** (Resend 10 template / Iyzico 4 senaryo + iade / Shipentegra 9 carrier URL / Upstash + Sentry env aktivasyonu / Lighthouse + k6 + axe ölçüm / backup tatbikatı): RUNBOOK pre-deploy adımlarına taşındı. Kod tabanı **0 P0 / 0 P1 açık** ile production-ready.

- **2026-05-06 (öğleden sonra):** **Bölüm 2 production audit** — admin paneli (~30 sayfa + 50 endpoint) + bayi paneli + Prisma schema/migrations + OWASP ASVS L2 tur 3. **P0 ve P1 yok** — Faz 16+17 + Bölüm 1 sonrası kod tabanı sertleşmiş. 7 P2 / 11 P3 bulgu (`docs/PRODUCTION_AUDIT_P2.md`, `docs/API_INVENTORY_P2.md`, `docs/SECURITY_AUDIT_P2.md`). Uygulanan fix: **`accounting/export` audit log eklendi** (P2-API-1 / P2-A09-1 — KVKK uyumu için bulk PII ihracı iz bırakır; yeni `ACCOUNTING_EXPORT` audit action). Doğrulamalar: 45/45 admin endpoint `requireRole("ADMIN")` ilk satır + layout-level redirect, 11/11 bulk endpoint MAX_AFFECTED + Zod array.max(), 7 `prisma.$queryRaw` callsite'ı parameterized (Prisma.sql), 0 server actions kullanımı, A01-A10 + open redirect 10 payload + XSS + CSRF + path traversal + prototype pollution **PASS**. `npm audit --omit=dev` 3 moderate dev-only (`@hono/node-server`, `hono` via `@prisma/dev`); prod runtime risk yok ama `prisma` 6.19.3 (semver major) Bölüm 3 deploy hazırlığında. 159/159 vitest stabil + tsc temiz. Faz 4 entegrasyonları + final QA + P2/P3 batch fix **Bölüm 3**.
