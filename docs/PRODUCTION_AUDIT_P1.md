# Production Audit — Bölüm 1 (Storefront + Public API + Lib)

> **Kapsam**: `src/app/(storefront)`, `src/app/(auth)`, `src/app/api/{auth,account,cart,coupons,contact,kvkk-basvuru,orders,pageview,payments,products,reviews,search,client-error,dealer}` ve `src/lib/*`.
> Admin paneli ve security tur 2 — Bölüm 2 kapsamında.
> Baseline: 2026-05-06 — vitest 159/159 yeşil, `tsc --noEmit` temiz, mevcut Faz 17.

## Metodoloji

1. Statik (kod okuma + grep), Dinamik (canlı dev server, curl, Playwright), Regresyon (vitest + scripts/test-*).
2. Bulgular `[Px] [zone] başlık` formatında, fix commit hash'i ile takip.
3. Sıra: P0 → P1 → P2 → P3. P0 açıkken P2'ye geçilmedi.

## Skor

| Bölge | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Storefront sayfalar | 0 | 2 | 4 | 5 |
| Public/Account/Dealer API | 0 | 1 | 2 | 2 |
| `src/lib/*` modüller | 0 | 4 | 4 | 3 |
| Build/Env/Deploy | 0 | 3 | 1 | 0 |
| **TOPLAM** | **0** | **10** | **11** | **10** |

> P0 yok — Faz 16+17 sertleştirmeleri kritik açıkları çoktan kapatmış. P1'lerin çoğu prod'a çıkarken doğru çalışmaması veya defansif eksiklik kategorisinde.

---

## P1 — Production Blockers (10)

### P1-LIB-1 — Login email enumeration via timing differential
**Yer**: `src/lib/auth.ts:31-38`
**Belirti**: Kayıtlı olmayan email için `bcrypt.compare()` çalıştırılmadan `null` dönülüyor. Saldırgan response gecikme farkıyla email var/yok ayrımı yapabilir (~50–100ms fark). Faz 16 forgot-password'de `timingSafeNoop` ekledi ama login path'inde aynı koruma yok.
**Risk**: Kullanıcı email enumeration → hedefli phishing/credential stuffing kampanyası.
**Onarım**: Missing-user dalında sabit dummy bcrypt-compare çalıştır (constant-time) → user dönmemiş olsa bile gecikme eşitlenir.
**Doğrulama**: `scripts/test-login-timing.ts` 20 ölçüm; var-vs-yok arası fark < 50 ms.
**Fix**: `<dolduruldu>` (commit hash aşağıda)

### P1-LIB-2 — Login rate-limit only on email key (no per-IP guard)
**Yer**: `src/lib/auth.ts:19`
**Belirti**: `rateLimit(\`login:${emailKey}\`, 10, 15min)` — saldırgan birçok email ile dener, her email için ayrı limit. Per-IP password spray bloklanmıyor.
**Risk**: 1 IP'den 100 farklı email × her birine 10 deneme = 1000 RP/15min. Yavaş ama tespit edilemez.
**Onarım**: İkinci limit `login:ip:<ip>` 30/15min ekle. İkisinden biri tetiklenirse reddedilsin.
**Doğrulama**: 31. denemede 429 (manuel curl döngüsü).

### P1-LIB-3 — Email transport silent DRYRUN in production
**Yer**: `src/lib/email.ts:24, 60-77`
**Belirti**: SMTP env (host/port/user/pass) eksikse her gönderim sessizce DRYRUN'a düşüyor + log kaydı `DRYRUN`. Resend sandbox 550 hatası da `return true` ile sessizce başarılı sayılıyor.
**Risk**: Production'a `RESEND_API_KEY` koymak unutulursa kullanıcı kayıt → email gelmez → hesabı doğrulayamaz; admin de hata bildirimi görmez. **Sessiz veri kaybı.**
**Onarım**: `NODE_ENV=production` + transporter null kombinasyonunda `console.error` + opsiyonel `errorLog` kaydı + Sentry-style alert hook. Sandbox-fallback kararı yalnız `NODE_ENV !== "production"` için kalsın.
**Doğrulama**: `tests/email-prod-guard.test.ts` — prod env'de transporter yokken `sendEmail` log.error çağırıyor.

### P1-LIB-4 — `NEXTAUTH_URL` optional in production
**Yer**: `src/lib/env.ts:14`
**Belirti**: `NEXTAUTH_URL: z.string().url().optional()` — prod'da unutulursa `email.ts:140`, `email-verification.ts:33`, `email.ts:617` gibi yerlerdeki email URL'leri `localhost:3000` veya `mastereducation.com.tr` default'una düşer. NextAuth callback URL'leri de bozulur.
**Risk**: Email içindeki tüm linkler localhost gösterir → kullanıcı kayıt akışı kırılır. NextAuth state mismatch.
**Onarım**: `.refine((v) => process.env.NODE_ENV !== "production" || !!v)` ile prod'da zorunlu kıl.
**Doğrulama**: `tests/env-validation.test.ts` — prod + missing NEXTAUTH_URL throws.

### P1-API-1 — `register` audit action semantically wrong
**Yer**: `src/app/api/auth/register/route.ts:92`
**Belirti**: Kayıtlı email ile yeniden register denenince audit'e `USER_PROFILE_UPDATE` action'ı yazılıyor. Admin audit listesinde "profile update" görünür → gerçek register-attempt-existing aktivitesi gizlenir.
**Risk**: Soruşturma ve breach response zorlaşır; brute-force kampanyası invisible olur.
**Onarım**: Yeni `AUTH_REGISTER_ATTEMPT_EXISTING` action ekle (`audit.ts`'e), register/route.ts:92'de kullan.
**Doğrulama**: `scripts/test-audit-and-dealer-guard.ts` extend + grep `USER_PROFILE_UPDATE` ile register source eşleşmesin.

### P1-PAGE-1 — Relative canonical URLs on category & publisher pages
**Yer**: `src/app/(storefront)/kategoriler/[slug]/page.tsx:37`, `src/app/(storefront)/yayinevleri/[slug]/page.tsx:37`
**Belirti**: `alternates: { canonical: "/kategoriler/${slug}" }` — relative path. Search engine'ler kanonik URL'i origin ile eşleyemediğinde duplicate-content sinyali verebilir; URL parametreli versiyonlar (sayfa, sıralama, arama) tek kanoniğe toplanmaz.
**Risk**: SEO ranking düşüşü, indeksleme tutarsızlığı.
**Onarım**: `urunler/[slug]/page.tsx`'teki pattern (absolute URL) uygula — `${process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr"}/kategoriler/${slug}`.
**Doğrulama**: `curl /kategoriler/<slug> | grep canonical` → tam URL.

### P1-PAGE-2 — Login flow not warning on disabled email verification (UX P1)
**Yer**: `src/app/(auth)/giris/page.tsx`, `src/app/api/auth/[...nextauth]/route.ts`
**Belirti**: NextAuth credentials authorize'da `user.emailVerified === null` kontrolü yok. Onaylanmamış email ile login → session oluşur → checkout/profile akışı kullanıcı emailVerified guard'ları olmadan ilerleyebilir.
**Risk**: Email enumeration kombinasyonu — bot register sonrası direkt login.
**Onarım**: `authorize`'da `if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED")`. UI'da yeniden gönder linki.
**Not**: Mevcut implementasyonda guard tanımı `requireApprovedDealer` ile dealer için var; CUSTOMER için doğrulanmamış email ile siparişe izin veriliyor. Bu ürün kararı ise işaretle, değilse fix.
**Doğrulama**: `scripts/test-email-verify-required.ts` — emailVerified=null user login → 401.

### P1-LIB-5 — `email-verification.ts` non-atomic invalidate-then-create
**Yer**: `src/lib/email-verification.ts:20-31`
**Belirti**: `updateMany` (eski tokenları invalidate) + `create` (yeni token) ayrı işlemler. İki paralel çağrı → her ikisi de başarılı, kullanıcıya iki geçerli token sızar. Risk düşük (her token tek-kullanımlık + 1h TTL) ama prensip ihlali.
**Onarım**: Her ikisini `prisma.$transaction([...])` ile sar.
**Doğrulama**: `scripts/test-email-verify-token-race.ts` — 5 paralel çağrı → tek geçerli token kalmalı.

### P1-DEPLOY-1 — `BRAND.taxOffice` / `taxNumber` / `mersisNumber` boş (legal compliance)
**Yer**: `src/lib/constants.ts:8-11`
**Belirti**: Yorumda "canliya gecmeden once dogru degerlerle doldurulmali" diye not düşülmüş. Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu ve InvoiceView bu alanları koşullu render ediyor — boşken satır atlanıyor (crash yok).
**Risk**: 6502 sayılı Tüketici Kanunu + Mesafeli Sözleşmeler Yönetmeliği gereği satıcı vergi bilgilerinin sözleşmede yer alması zorunlu. Yasal uyumluluk eksiği. KolayBi e-Fatura entegrasyonu da bu alanlar olmadan çalışmaz.
**Onarım**: 
1. `.env`'e `BRAND_TAX_OFFICE`, `BRAND_TAX_NUMBER`, `BRAND_MERSIS_NUMBER` ekle (override).
2. `constants.ts` env'den oku, fallback `""`.
3. Production deploy runbook'a "Bu üç değer dolu olmadan canlıya çıkma" notu.
4. `scripts/check-prod-env.ts`'e check ekle.
**Doğrulama**: `npx tsx scripts/check-prod-env.ts` prod env eksikken hata veriyor.

### P1-DEPLOY-2 — In-memory rate-limit horizontal scaling açığı
**Yer**: `src/lib/rate-limit.ts:13`
**Belirti**: `Map` instance per process. Vercel/serverless ortamında her cold start veya concurrent worker yeni map → limitler etkin olarak >>10× görünür.
**Risk**: Faz 16 register limit 10→5/h düşürmesinin etkisi sıfırlanır; brute-force pratik olarak bypass edilir.
**Onarım**: Roadmap 4.4 — Upstash Redis adapter. Geçici palyatif: dev/single-instance "ok"; ama production deploy öncesi mutlaka.
**Doğrulama**: Bölüm 2'ye taşındı (entegrasyon işi).

---

## P2 — Önemli ama prod'a çıkmayı engellemez (11)

### P2-LIB-1 — `safe-callback.ts` double-encoded slash bypass'a açık
**Yer**: `src/lib/safe-callback.ts:21-29`
**Belirti**: `%2f%2f` kontrolü yok. Saldırgan `/giris?callbackUrl=%2f%2fevil.com` veya control-char prefix (`%09//evil.com`, `%0a//evil.com`) ile koruma atlatabilir.
**Risk**: Open redirect (login sonrası victim).
**Onarım**: `decodeURIComponent` once + `\t\r\n\v\f` ASCII control char reddi.
**Doğrulama**: `tests/safe-callback.test.ts` extend — 6 yeni payload.

### P2-LIB-2 — `addressUpdateSchema` PATCH partial validation gap
**Yer**: `src/lib/validations.ts:380-390`
**Belirti**: Yalnız `district` gönderildiğinde `isValidLocation` çağrılmıyor. Endpoint merge sonrası kontrol var (`account/addresses/[id]/route.ts`) ama schema-level yumuşaklık iki katmanlı savunmayı zayıflatıyor.
**Onarım**: Endpoint tarafında merge'den sonra `isValidLocation(merged.city, merged.district)` zaten var → kanıt için test ekle.

### P2-LIB-3 — `uploads.ts` magic-byte check after full buffer load (DoS pencere)
**Yer**: `src/lib/uploads.ts:91-94`
**Belirti**: `file.arrayBuffer()` tam dosyayı RAM'e yükledikten sonra magic-byte kontrolü. 1000 paralel 8MB upload = 8GB anlık RAM baskısı.
**Risk**: Memory pressure; 8MB cap mevcut ama concurrency cap yok.
**Onarım**: İlk 16 byte slice → magic check → sonra tam load. Veya stream-based parser.

### P2-API-1 — Dealer document PATCH/DELETE'de `dealerStatus === APPROVED` kontrolü yok
**Yer**: `src/app/api/dealer/documents/[id]/route.ts:12`
**Belirti**: `requireApprovedDealer` yerine sadece `auth()` + role+ownership kontrolü. SUSPENDED dealer hâlâ kendi belgelerini silebilir.
**Risk**: Düşük (sahip kendi belgelerini yönetebilmesi normal); tutarlılık eksiği.
**Onarım**: `requireApprovedDealer()` çağrısına döndür, JWT staleness koruması da gelsin.

### P2-API-2 — `dealer/bulk-order/submit` 500 stack leak potansiyeli
**Yer**: `src/app/api/dealer/bulk-order/submit/route.ts:238-262`
**Belirti**: Transaction `.catch()` belirli error code'ları handle ediyor; bilinmeyen DB hatası bubble up → Next default 500'e düşer, stack response'a sızabilir (özellikle `productionBrowserSourceMaps: false` olsa bile JSON body'si).
**Onarım**: Tüm route'u `try/catch` ile sar, generic `{error:"INTERNAL_ERROR"}` döndür.

### P2-PAGE-1..4 — Loading skeleton eksiklikleri
**Yerler**: `kategoriler/loading.tsx` yok, `yayinevleri/loading.tsx` yok, `kargo-takip/[no]/loading.tsx` yok, `siparis-takip/loading.tsx` yok.
**Belirti**: 100-300ms data fetch sırasında boş ekran → algılanan yavaşlık.
**Onarım**: Mevcut `urunler/loading.tsx` patternini kopyala.

---

## P3 — UX/style/cleanup (10)

| # | Yer | Bulgu |
|---|---|---|
| P3-1 | static pages (sss, iade, hakkimizda, ...) | Per-page metadata title/description eksik; layout default kullanıyor |
| P3-2 | `src/lib/pricing.ts` | `discountPct` sınır kontrolü (0-100) runtime'da yok; DB constraint güveniliyor |
| P3-3 | `src/lib/env.ts:46` | `KOLAYBI_API_KEY` `.optional()` ama uzunluk kontrolü yok |
| P3-4 | `src/app/api/reviews/route.ts:68` | `status: "APPROVED"` hardcoded; constant olarak çıkar |
| P3-5 | `cart/refresh`, `account/profile/PATCH` rate-limit yok | Defansif olarak ekle |
| P3-6 | `audit.ts:131` recursive | Circular ref guard yok (depth/visited set) |
| P3-7 | `src/lib/uploads.ts:108` | `publicUrl: "/api/dealer/documents/by-blob/download"` — id'siz path; consume edilmiyorsa kaldır |
| P3-8 | `validations.ts:307` | `productCreateSchema.sku` regex/whitespace kontrol yok |
| P3-9 | `register/route.ts:62` | `marketingConsent: parsed.data` üzerinden işliyor, default `false` ✓ ama UI checkbox label "tetik" değil "Master Education'dan kampanya alma izni" — açık riza yazısı netleştirilebilir |
| P3-10 | `email.ts:140, 203, 373, 402, 529` | `process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr"` 5 yerde tekrar — tek helper'a indir |

---

## Düzeltme planı (Bölüm 1 sonu)

| ID | Önce | Aksiyon | Commit |
|---|---|---|---|
| P1-LIB-1 | timing leak | dummy bcrypt | c716e2f |
| P1-LIB-2 | per-IP yok | ek limit | c716e2f |
| P1-LIB-3 | silent dryrun | prod warn | c716e2f |
| P1-LIB-4 | NEXTAUTH_URL opt | prod required | c716e2f |
| P1-API-1 | yanlış audit action | new action | c716e2f |
| P1-PAGE-1 | rel canonical | abs URL | c716e2f |
| P1-LIB-5 | non-atomic verify | $transaction | c716e2f |
| P1-DEPLOY-1 | BRAND.tax* boş | env override | c716e2f |
| P1-PAGE-2 | unverified login | (Bölüm 2 — UX kararı bekliyor) | — |
| P1-DEPLOY-2 | rate-limit RAM | Roadmap 4.4 (Bölüm 2) | — |

P2 ve P3 — Bölüm 2'ye devir.

---

## Bölüm 2'ye devir (admin paneli + security tur 2 + entegrasyonlar)

Bölüm 1 dışında ayrı denetim turu gerektirenler:

1. **`src/app/admin/**` ve `src/app/api/admin/**`** — 60+ endpoint, 30+ sayfa. Mass-assignment, IDOR, audit, rol-sızıntısı, bulk endpoint'lerin güvenlik vektörleri ayrı bir tura ihtiyaç duyar.
2. **`src/app/bayi/**` panel sayfaları** — Bu turda yalnız dealer API'ları denetlendi; bayi UI sayfalarının statik denetimi Bölüm 2'de.
3. **Security tur 2** (Faz 17 sonrası ek vektörler):
   - JWT staleness/admin downgrade race (`api-auth.ts:requireRole` JWT-based)
   - WebSocket / SSE varsa origin check
   - File upload polyglot (PDF içine JS embed) advanced check
   - SSRF — Vercel Blob fetch'inde redirect follow var mı?
4. **Entegrasyonlar** (Faz 4):
   - 4.1 SMTP/Resend canlı doğrulama
   - 4.2 Iyzico/Param sandbox + signature verify
   - 4.3b Shipentegra adapter
   - 4.4 Upstash Redis rate-limit
   - 4.6 Sentry/Logtail
   - 4.7 Vercel deploy + cron + custom domain
5. **Operasyonel deploy runbook**:
   - `BRAND.taxOffice/taxNumber/mersisNumber` doldurma
   - `NEXTAUTH_SECRET` üretme
   - `CRON_SECRET` 16+ char
   - `KOLAYBI_API_KEY` + `KOLAYBI_CHANNEL` (KolayBi entegrasyonu varsa)
   - `RESEND_API_KEY` + domain verify
   - `NEXTAUTH_URL` prod domain
   - `ADMIN_EMAIL` gerçek kutu

---

## Test baseline (Bölüm 1 başlangıcı)

- `npx vitest run` → **159/159** ✓
- `npx tsc --noEmit` → temiz ✓
- Mevcut e2e scriptler çalışır durumda (Faz 0–17)

## Dış doğrulama scriptleri (Bölüm 1 sonunda eklenecek)

- `scripts/test-login-timing.ts` (P1-LIB-1)
- `scripts/test-login-ip-rate-limit.ts` (P1-LIB-2)
- `tests/email-prod-guard.test.ts` (P1-LIB-3)
- `tests/env-validation.test.ts` (P1-LIB-4)
- `tests/safe-callback.test.ts` extend (P2-LIB-1)
