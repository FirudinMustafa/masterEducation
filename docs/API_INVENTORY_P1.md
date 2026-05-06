# API Inventory — Bölüm 1 (Public + Account + Dealer)

> Kapsam: `src/app/api/` altındaki public/account/dealer endpoint'leri.
> Admin endpoint'leri **Bölüm 2** kapsamında.
> Bu doküman 2026-05-06 tarihinde, mevcut Faz 17'ye kadar olan kod tabanı baz alınarak oluşturulmuştur.

## Özet rakamlar

| Tip | Adet |
|---|---|
| Public (auth gerekmez) | 13 |
| Account (session gerekir) | 9 |
| Dealer (DEALER + APPROVED) | 11 |
| **Toplam (Bölüm 1)** | **33** |

---

## Sütun açıklamaları

- **auth**: `none` / `session` (rol fark etmez) / `admin` / `dealer` / `optional` (guest + üye)
- **role-line**: handler'ın hangi satırında auth/role kontrolü yapılıyor (1-based)
- **zod**: kullanılan şema (`src/lib/validations.ts`) — `—` yoksa
- **rate-limit**: `<bucket-key>` `<n>/<window>`
- **audit**: çıkan audit action ya da `—`
- **tx**: `prisma.$transaction` kullanıyor mu (Y/N)
- **idempot**: idempotency stratejisi
- **error**: hata gövdesi şekli — `{error,...}` standart

---

## Auth (6)

| Endpoint | Method | Auth | Zod | Rate-limit | Audit | Tx | Idempot | Error |
|---|---|---|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | nextauth | — | `login:<email>` 10/15min | `AUTH_LOGIN_FAIL` (login fail) | N | NextAuth | NextAuth |
| `/api/auth/register` | POST | none | `registerSchema` | `register:<ip>` 5/h | `EMAIL_VERIFY_REQUEST`, `USER_CONSENT_GIVEN`, `USER_PROFILE_UPDATE` (yanlış!*) | N | generic 201 (enum-suppress) | `{error}` |
| `/api/auth/forgot-password` | POST | none | `forgotPasswordSchema` | `forgot:<ip>` 5/h | — | N | hash-token + timing noop | `{ok}` |
| `/api/auth/reset-password` | POST | none | `resetPasswordSchema` | `reset:<ip>` 10/h | — | Y | atomic mark-used | `{ok\|error}` |
| `/api/auth/verify-email` | POST | none | min(10) | — | `EMAIL_VERIFY_SUCCESS` | Y | atomic mark-used | `{ok\|error}` |
| `/api/auth/resend-verification` | POST | session | — | `verify-resend:<userId>` 3/h | `EMAIL_VERIFY_REQUEST` | N | `verifiedAt` kontrolü | `{ok\|error}` |

\* `USER_PROFILE_UPDATE` action register-attempt-existing için kullanılıyor — yanlış semantik. Bkz. `PRODUCTION_AUDIT_P1.md` P1-API-1.

## Account (6)

| Endpoint | Method | Auth | Zod | Rate-limit | Audit | Tx | Idempot | Error |
|---|---|---|---|---|---|---|---|---|
| `/api/account/profile` | PATCH | session | `profileUpdateSchema` | — | `USER_PROFILE_UPDATE` | N | email değişince currentPassword zorunlu | `{error\|ok}` |
| `/api/account/change-password` | POST | session | `changePasswordSchema` | — | `USER_PASSWORD_CHANGE` | N | bcrypt verify | `{error\|ok}` |
| `/api/account/addresses` | GET | session | — | — | — | N | userId filter | `{addresses}` |
| `/api/account/addresses` | POST | session | `addressSchema` | — | `ADDRESS_CREATE` | Y | isDefault flip atomic | `{id}` |
| `/api/account/addresses/[id]` | PATCH | session | `addressUpdateSchema` | — | `ADDRESS_UPDATE` | Y | userId ownership + merge-then-validate | `{error\|ok}` |
| `/api/account/addresses/[id]` | DELETE | session | — | — | `ADDRESS_DELETE` | N | userId ownership | `{ok}` |
| `/api/account/delete` | POST | session | confirm + password | — | `USER_SELF_DELETE` | Y (anonymize path) | hard|anonymize fork | `{ok}` |

## Storefront / Public (10)

| Endpoint | Method | Auth | Zod | Rate-limit | Audit | Tx | Idempot | Error |
|---|---|---|---|---|---|---|---|---|
| `/api/cart/refresh` | POST | optional | items[] | — | — | N | read-only | `{items}` |
| `/api/coupons/validate` | POST | optional | code+items | `coupon-validate:<ip>` 20/h | `COUPON_VALIDATE` (opsiyonel) | N | read-only | `{discount\|error}` |
| `/api/contact` | POST | none | `contactFormSchema` | `contact:<ip>` 5/h | `CONTACT_FORM_SUBMIT` | N | no guard | `{ok}` |
| `/api/kvkk-basvuru` | POST | none | KVKK schema | `kvkk-basvuru:<ip>` 3/h | `KVKK_APPLICATION_SUBMITTED` | N | no guard | `{ok,requestId}` |
| `/api/orders` | POST | optional | `orderCreateSchema` | `order-create:user:<id>\|ip` 20/h | `ORDER_CREATE`, `ORDER_CONTRACTS_ACCEPTED` | Y | paymentToken + atomic stock/coupon/ledger | `{success,orderId}` |
| `/api/orders/[id]/pdf` | GET | session | — | — | — | N | userId IDOR + admin override | binary\|`{error}` |
| `/api/payments/mock/confirm` | POST | none | `paymentConfirmSchema` | (route-level guard) | `ORDER_AUTO_APPROVE` | Y | atomic claim (updateMany WHERE PENDING) | `{status,orderId}` |
| `/api/products/[id]` | GET | none | — | — | — | N | read-only + dealer pricing | `{product}` |
| `/api/reviews` | POST | session | `reviewCreateSchema` | `review:<userId>` 10/h | `REVIEW_CREATE` | N | unique (userId,productId) | `{id,status}` |
| `/api/reviews/[id]` | PATCH | session | `reviewUpdateSchema` | — | `REVIEW_UPDATE` | N | userId IDOR | `{ok\|error}` |
| `/api/reviews/[id]` | DELETE | session | — | — | `REVIEW_DELETE` | N | userId IDOR | `{ok}` |
| `/api/search` | GET | none | q param | `search:<ip>` 60/60s | — | N | read-only | `{products,publishers,categories}` |
| `/api/pageview` | POST | optional | event schema | `pageview:<ip>` 240/60s | — | N | fire-and-forget | `{ok}` |
| `/api/client-error` | POST | optional | error schema | `client-error:<ip>` 30/60s | — | N | fire-and-forget | `{ok}` |

## Dealer (11)

Hepsinde `requireApprovedDealer()` çağrılır → `dealer.status === "APPROVED"` fresh DB read (JWT staleness korumalı).

| Endpoint | Method | Auth | Zod | Rate-limit | Audit | Tx | Idempot | Error |
|---|---|---|---|---|---|---|---|---|
| `/api/dealer/apply` | POST | none | `dealerApplySchema` | `dealer-apply:<ip>` 5/h | `DEALER_APPLY`, `USER_CONSENT_GIVEN` | N | generic 201 (enum-suppress) | `{ok\|error}` |
| `/api/dealer/me` | GET | dealer | — | — | — | N | read-only | `{dealer}` |
| `/api/dealer/statement` | GET | dealer | query (date range) | — | `DEALER_STATEMENT_EXPORT` | N | read-only | xlsx\|csv |
| `/api/dealer/documents` | POST | dealer | formData (kind+file) | `dealer-doc-upload:<dealerId>` 30/h | `DEALER_DOCUMENT_UPLOAD` | N | random suffix unique | `{id,url}` |
| `/api/dealer/documents/[id]` | DELETE | dealer | — | — | `DEALER_DOCUMENT_DELETE` | N | dealerId IDOR + Blob del | `{ok}` |
| `/api/dealer/documents/[id]/download` | GET | session (dealer\|admin) | — | — | — | N | dealerId IDOR + Blob URL whitelist regex | binary\|`{error}` |
| `/api/dealer/bulk-order/template` | GET | dealer | — | — | — | N | read-only | xlsx |
| `/api/dealer/bulk-order/parse` | POST | dealer | excel | — | — | N | read-only | `{lines,summary}` |
| `/api/dealer/bulk-order/submit` | POST | dealer | items+shipping | — (route-level guard against PREPAID) | `DEALER_BULK_ORDER` | Y | atomic stock + ledger + (suspended-defensive recheck) | `{orderId\|error}` |

---

## Toplu doğrulama notları

### IDOR matrisi
- ✅ `account/addresses/[id]` PATCH/DELETE → `where.userId` filtresi
- ✅ `orders/[id]/pdf` → `userId` filtresi (admin override account-aware)
- ✅ `reviews/[id]` PATCH/DELETE → `userId` filtresi
- ✅ `dealer/documents/[id]` DELETE/Download → `dealerId` filtresi (dealer'ın `userId`'si üzerinden)

Test: `scripts/test-security-fixes.ts` ve `scripts/test-security-r2.ts` (Faz 16+17)

### Rate-limit kapsamı
- ✅ Auth (login/register/forgot/reset/resend)
- ✅ Form (contact / kvkk-basvuru)
- ✅ Coupon validate (kritik — 20/h)
- ✅ Search, pageview, client-error
- ✅ Dealer apply / dealer-doc-upload
- ⚠️ **Eksik**: `cart/refresh`, `account/*` PATCH/DELETE — düşük abuse riski ama defansif rate-limit yok (P3)

### Transaction kullanımı
- ✅ `orders` (stock + coupon + ledger + paymentSession atomik)
- ✅ `payments/mock/confirm` (atomic claim)
- ✅ `account/addresses` POST (isDefault flip)
- ✅ `account/delete` (anonymize tx)
- ✅ `dealer/bulk-order/submit` (stock + ledger)

### Audit metadata sanitize
Tümü `logAudit()` üzerinden geçiyor; `sanitizeAuditMetadata` recursive `password/token/secret/cvv/cardnumber/api-key/...` redact ediyor (Faz 17). Kanıt: `tests/security-r2.test.ts`.

### Hata gövdesi tutarlılığı
- 401 / 403 / 404 / 409 / 422 / 429 / 500 ayrımı tutarlı
- Stack trace prod'da sızdırılmıyor (`error-log.ts` truncation + `[error]:` console)

### Idempotency
- ✅ Order create: `paymentToken` (UUID) + atomic claim
- ✅ Mock confirm: atomic claim → loser 409
- ✅ Account/delete: rol kontrolü ikinci çağrıda no-op
- ✅ Verify/reset token: atomic mark-used → ikincil çağrı 410
- ⚠️ Reviews POST iki kez çağrılırsa unique-constraint 409 — graceful değil (P3 — frontend zaten guard ediyor)

---

## Bulguların özeti (Bölüm 1)

| Bölge | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| API endpoint | 0 | 1 | 2 | 2 |

Detay → `docs/PRODUCTION_AUDIT_P1.md`.
