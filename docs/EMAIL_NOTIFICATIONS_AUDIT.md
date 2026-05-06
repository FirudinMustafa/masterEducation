# Email Bildirim Tamamlama — Denetim Notu

24 madde için durum, tetik noktaları ve template adları.
Tüm kayıtlar `email_logs` tablosunda izlenebilir; gönderim `src/lib/email.ts`
üzerinden Resend SMTP'ye gider, yapılandırma yoksa DRYRUN moduna düşer.

---

## P0 — Operasyonel kör nokta (commit `9b49c83`)

| ID | Olay | Alıcı | Template | Tetik (file:satır yakınlığı) |
| -- | ---- | ----- | -------- | ----------------------------- |
| E1 | Yeni sipariş (B2C + B2B) | ADMIN | `templateOrderCreatedAdminNotice` | `api/orders/route.ts` after-block + `api/dealer/bulk-order/submit/route.ts` after-block |
| E2 | Yeni bayi başvurusu | ADMIN | `templateDealerApplicationAdminNotice` | `api/dealer/apply/route.ts` after-block |
| E3 | 3DS ödeme başarılı | Müşteri + ADMIN | `templatePaymentSucceeded` (forAdmin flag) | `api/payments/mock/confirm/route.ts` success path + `api/payments/iyzico/callback/route.ts` success path |
| E4 | 3DS ödeme başarısız | Müşteri | `templatePaymentFailed` | `api/payments/mock/confirm/route.ts` failure path + `api/payments/iyzico/callback/route.ts` failure path |
| E5 | Bayi belge incelendi | Bayi | `templateDealerDocumentReviewed` | `api/admin/dealers/[id]/documents/[docId]/route.ts` PATCH |
| E6 | Bayi yeni belge yükledi | ADMIN | `templateDealerDocumentUploadedAdminNotice` | `api/dealer/documents/route.ts` POST |
| E7 | Bayi siparişi (admin) | ADMIN | `templateOrderCreatedAdminNotice` (`isB2B=true`) | E1'de `isB2B` flag ile birleşik (ayrı template gerekmedi) |

---

## P1 — Güvenlik & UX kritik (commit `97121c5`)

| ID | Olay | Alıcı | Template | Tetik |
| -- | ---- | ----- | -------- | ----- |
| E8 | Şifre değişti | Kullanıcı | `templatePasswordChanged` | `api/account/change-password/route.ts` |
| E9 | Email değişti | Eski + yeni email | `templateEmailChanged` (forOldEmail flag) | `api/account/profile/route.ts` (current pwd ile gated) |
| E10 | Hesap silindi/anonimleştirildi | Kullanıcı | `templateAccountDeleted` (mode hard/anonymize) | `api/account/delete/route.ts` + `api/admin/users/[id]` DELETE + `api/admin/users/bulk-delete` (silme öncesi adres yakalanır, after()'da gönderilir) |
| E11 | Sipariş iptal edildi | Müşteri | `templateOrderCancelled` | `api/admin/orders/[id]/status/route.ts` + `bulk-status/route.ts` (status==="CANCELLED" switch) |
| E12 | Kredi limiti değişti | Bayi | `templateDealerCreditLimitChanged` | `api/admin/dealers/bulk-adjust-credit/route.ts` (only fark edenler) + `api/admin/dealers/[id]/route.ts` PATCH |
| E13 | Cari hesap hareketi | Bayi | `templateDealerLedgerEntry` (PAYMENT/ADJUSTMENT) | `api/admin/dealers/[id]/payments/route.ts` + `api/admin/dealers/[id]/adjustments/route.ts` |

---

## P2 — Moderation & dolaylı (commit `72520a7`)

| ID | Olay | Alıcı | Template | Tetik |
| -- | ---- | ----- | -------- | ----- |
| E14 | Yorum onaylandı/reddedildi | Yazan | `templateReviewModerated` | `api/admin/reviews/[id]/route.ts` PATCH + `bulk-status/route.ts` (DELETE'de mail yok) |
| E15 | Yeni yorum | ADMIN | `templateNewReviewAdminNotice` | `api/reviews/route.ts` POST |
| E16 | Yeni kullanıcı kaydı | ADMIN | `templateNewUserSignupAdminNotice` | `api/auth/register/route.ts`, opt-in `ADMIN_NOTIFY_NEW_SIGNUP=true` (dealer kayıtları E2 ile kapsanıyor) |
| E17 | Email doğrulama tekrar gönderme | Kullanıcı | `templateEmailVerification` | `api/auth/resend-verification/route.ts` zaten `issueEmailVerificationToken` üzerinden mail tetikliyor — değişiklik yapılmadı |

---

## P3 — Proaktif izleme (commit pending)

| ID | Olay | Alıcı | Template | Tetik |
| -- | ---- | ----- | -------- | ----- |
| E18 | Düşük stok (daily digest) | ADMIN | `templateLowStockDigest` | `api/cron/low-stock-alert/route.ts` (yeni cron, 08:00 UTC), `LOW_STOCK_THRESHOLD` env (default 5) |
| E19 | Cron job hatası | ADMIN | `templateCronFailureAdminNotice` | `src/lib/cron-runner.ts` `runCronJob()` wrapper, 5 cron'da uygulandı |
| E20 | Fatura retry tükendi | ADMIN | `templateInvoiceRetryExhaustedAdminNotice` | `src/lib/invoice-service.ts` `sendPendingInvoice` catch'te `attemptCount >= 5` |
| E21 | Yüksek değerli sipariş | ADMIN | `templateOrderCreatedAdminNotice` (`isHighValue=true`) | E1'in flag'i — `HIGH_VALUE_ORDER_THRESHOLD` (default 10000 TL); ayrı mail yerine banner |

---

## Bilinen sınırlamalar (defer)

| ID | Olay | Gerekçe |
| -- | ---- | ------- |
| E20 | İade talebi → admin + müşteri | `/iade` sayfası tamamen statik içerik, API endpoint yok; kullanıcılar `mailto:` ile başvuruyor. Endpoint eklendiğinde E11 (`templateOrderCancelled`) genişletilebilir. |
| E22 | Sepetteki ürün stoksuz/silindi | `cart/refresh` banner zaten kullanıcıyı bilgilendiriyor; mail gürültü riski. ROADMAP'e düştü. |
| E23 | Bayi 60 gün inactive → reaktivasyon | Pazarlama maili kategorisinde — KVKK açık rıza gerekir. Marketing consent flag'i `User.marketingConsent`'te var ama segment + frequency cap altyapısı yok; ayrı bir kampanya iş kalemi. |

---

## Audit ve gözlemlenebilirlik

- Her gönderim `email_logs` (DRYRUN/SENT/FAILED/DRYRUN_SANDBOX) ile kayıt altında.
- Hassas alanlar (parola, kart no, CVV) `escapeHtml()` veya hiç template'e geçmez.
- Cron failure email'i `await sendEmail(...)` ile yollanır (queueEmail'in fire-and-forget davranışı serverless shutdown'da kaybolma riski yaratır).
- `EMAIL_NOTIFICATION_SENT` audit action'ı eklenmedi — `email_logs` zaten gönderim izini tutuyor; her tetikleyici için ikinci bir audit kaydı gürültü olurdu.

---

## Yeni env değişkenleri (.env.example güncel)

| Env | Default | Amaç |
| --- | ------- | ---- |
| `HIGH_VALUE_ORDER_THRESHOLD` | `10000` | E21 — admin alarmı eşiği (TL) |
| `ADMIN_NOTIFY_NEW_SIGNUP` | `false` | E16 — yeni kullanıcı bildirimi opt-in |
| `LOW_STOCK_THRESHOLD` | `5` | E18 — düşük stok cron eşiği (adet) |
