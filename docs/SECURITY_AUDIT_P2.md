# Security Audit — Bölüm 2 (OWASP ASVS L2 — tur 3)

> Bağımsız doğrulama. Faz 16 + Faz 17 + Bölüm 1 P1 fix'leri sonrası.
> Tarih: 2026-05-06.
> Format: madde × verdict × kanıt (file:line).

## Skor

| Kategori | Verdict | Yeni P1 | Yeni P2 | Yeni P3 |
|---|---|---|---|---|
| A01 BAC + IDOR | PASS | 0 | 0 | 0 |
| A02 Crypto | PASS | 0 | 0 | 0 |
| A03 Injection | PASS | 0 | 0 | 0 |
| A04 Insecure design | PASS | 0 | 0 | 0 |
| A05 Misconfig | PASS | 0 | 0 | 1 |
| A06 Vulnerable deps | PARTIAL | 0 | 1 | 0 |
| A07 Auth | PASS | 0 | 0 | 0 |
| A08 Integrity | PASS | 0 | 0 | 0 |
| A09 Logging | PASS | 0 | 1 | 1 |
| A10 SSRF | PASS | 0 | 0 | 0 |
| Open redirect | PASS | 0 | 0 | 0 |
| XSS | PASS | 0 | 0 | 0 |
| CSRF | PASS | 0 | 0 | 0 |
| File upload | PASS | 0 | 0 | 0 |
| Path traversal | PASS | 0 | 0 | 0 |
| Prototype pollution | PASS | 0 | 0 | 0 |
| Server Actions | N/A | 0 | 0 | 0 |
| **TOPLAM** | **PASS** | **0** | **2** | **2** |

---

## A01 — Broken Access Control + IDOR

**PASS**

- `src/app/admin/layout.tsx:11-15` — layout-level `auth()` + `redirect("/yonetim")` sayfa katmanını gateway'liyor.
- `src/lib/api-auth.ts:6-21` — `requireRole("ADMIN")` her admin API'de **ilk satır**.
- `src/lib/api-auth.ts:31-74` — `requireApprovedDealer()` JWT'ye güvenmiyor; `prisma.dealer.findUnique` ile her istekte fresh status okuyor → SUSPEND/REJECT'e anlık tepki.
- 45/45 admin endpoint'inde `requireRole` kanıtlandı (grep `requireRole\("ADMIN"\)`).
- IDOR — Bölüm 1'de doğrulandı: `account/addresses/[id]`, `orders/[id]`, `reviews/[id]`, `dealer/documents/[id]` → hepsi `where: { id, userId|dealerId }`.

## A02 — Cryptographic Failures

**PASS**

- `src/lib/env.ts:13` — `NEXTAUTH_SECRET` min 32 char (Faz 17).
- `src/lib/token-hash.ts:12-14` — SHA-256 reset/verify token DB hash.
- `bcrypt.hash(_, 10)` — register, reset-password, change-password (cost 10).
- Bölüm 1'de eklenen `DECOY_HASH` ile login timing eşitleniyor (`auth.ts:9-12`).

## A03 — Injection

**PASS**

- `prisma.$queryRaw` 7 callsite — hepsi parameterized template (`Prisma.sql` veya `tx.$queryRaw\``):
  - `src/lib/ledger.ts:41,49` — atomik UPDATE
  - `src/lib/search.ts:25,38,68,80` — FTS + ILIKE (her ikisi `Prisma.sql`)
  - `src/app/admin/analytics/page.tsx:41` — sabit SQL
  - `src/app/api/orders/route.ts:368` — coupon usedCount UPDATE
  - `src/app/(storefront)/urunler/page.tsx:59` — sabit SELECT
- `prisma.$queryRawUnsafe` / `$executeRawUnsafe` **kullanılmıyor** ✓
- Server Actions yok (`grep "use server"` zero match) → form action injection yüzeyi yok.

## A04 — Insecure Design

**PASS**

- Payment session atomic claim (`payments/mock/confirm/route.ts:79-101`) — `updateMany WHERE status=PENDING` → loser 409.
- Reset/verify token atomic mark-used (`auth/reset-password/route.ts`, `auth/verify-email/route.ts`).
- Order create idempotent `paymentToken` (UUID) — duplicate POST → aynı token bulunur, yeni session açılmaz.
- Coupon usedCount atomic (`orders/route.ts:368-376` — `WHERE usedCount < maxUses`).

## A05 — Misconfiguration

**PASS** (1 P3)

`next.config.ts:20-37`:
- ✓ `X-Frame-Options: DENY`
- ✓ `X-Content-Type-Options: nosniff`
- ✓ `Referrer-Policy: strict-origin-when-cross-origin`
- ✓ `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- ✓ CSP set (script `'unsafe-inline'` prod — Next.js standart)
- ✓ HSTS `max-age=63072000; includeSubDomains; preload` prod
- ✓ `productionBrowserSourceMaps: false`
- ✓ Image `dangerouslyAllowSVG` default false

NextAuth v5 cookies — varsayılan `Secure + HttpOnly + SameSite=Lax`. `auth.ts`'de override yok ✓

**P3-A05-1**: CSP `'unsafe-inline'` script (Next.js gerektiriyor) — gelecekte nonce-based CSP geçişi.

## A06 — Vulnerable Dependencies

**PARTIAL** (1 P2)

`npm audit --omit=dev` çıktısı:
- 3 moderate: `@hono/node-server` (path traversal in serveStatic) → `@prisma/dev` üzerinden çekilmiş, prod runtime'da çalışmıyor.
- `hono` JSX HTML injection — yine `@prisma/dev` dolaylı bağımlılığı.

**P2-A06-1**: `@prisma/dev` (dev-only) bağımlılığı. `npm audit --omit=dev` bunu da listelediği için runtime'da etkili değil, ama CI report'unda görünür. Fix: `prisma` ana paketi `6.19.3`'a çıkarmak (semver major).

NextAuth `^5.0.0-beta.30` — beta sabitlenmiş; stable çıkınca yükselt (Faz dışı).

## A07 — Authentication

**PASS**

- Login rate-limit: per-email 10/15min + per-IP 30/15min (Bölüm 1 fix).
- Register 5/h/IP, forgot 5/h/IP, reset 10/h/IP.
- Email enumeration:
  - Login: `auth.ts:54-57` — kullanıcı yoksa decoy bcrypt çağrılıyor (Bölüm 1 fix).
  - Register: generic 201 + `AUTH_REGISTER_ATTEMPT_EXISTING` audit (Bölüm 1 fix).
  - Forgot: `timingSafeNoop` 50-150ms (Faz 16).
- Password policy: min 8 char + harf + rakam (`registerSchema`, `changePasswordSchema`).
- Reset TTL 1h, verify TTL 1h (Faz 17).
- Session: NextAuth v5 JWT, session callback fresh-fetch role/dealer (`auth.ts:68-85`).

## A08 — Integrity

**PASS**

- Bulk-import all-or-nothing (`prisma.$transaction`) — `bulk-import/route.ts`, `discounts/upload/route.ts`.
- Magic-byte upload — `uploads.ts:34-69`. PDF/JPEG/PNG/WEBP. **GIF intentionally excluded** (low-need + animasyon DoS).
- Max 8MB belge / 5MB image enforced before parse (`uploads.ts:11`, `bulk-upload-images:16`).

## A09 — Logging

**PASS** (1 P2 + 1 P3)

- `audit.ts:99-116` — redact patterns: password, secret, token, otp, cvv, pin, cardnumber, api-key, authorization, bearer, channel.
- `audit.ts:129-144` — recursive sanitize.
- `error-log.ts:25-26` — message/stack truncation 4000/8000.

**P2-A09-1**: `accounting/export` audit log eksik (KVKK gereği bulk PII export iz bırakmalı).
**P3-A09-1**: `audit.ts:131` recursive — circular ref / depth limit yok. App-controlled metadata, gerçek istismar düşük; defansif iyileşme.

## A10 — Server-Side Request Forgery

**PASS**

- `dealer/documents/[id]/download/route.ts:63` — Vercel Blob URL whitelist regex (`*.public.blob.vercel-storage.com`).
- `adapters/kolaybi.ts` — yalnız `KOLAYBI_BASE_URL` env, user input yok.
- `email.ts` SMTP — env-based, user input yok.
- Diğer `fetch()` çağrıları kod tabanında user-controlled URL'e atmıyor.

## Open Redirect — 10 payload re-test

`src/lib/safe-callback.ts` üzerinde:

| # | Payload | Çıktı | Verdict |
|---|---|---|---|
| 1 | `https://evil.com` | `/` | ✓ |
| 2 | `//evil.com` | `/` | ✓ |
| 3 | `/\evil.com` | `/` | ✓ |
| 4 | `javascript:alert(1)` | `/` | ✓ |
| 5 | `/javascript:alert(1)` | `/` | ✓ (regex) |
| 6 | `data:text/html,...` | `/` | ✓ |
| 7 | `\t//evil.com` (literal tab) | `/` | ✓ (`startsWith("/")` fail) |
| 8 | `%2f%2fevil.com` | `/` | ✓ (`startsWith("/")` fail) |
| 9 | `///evil.com` | `/` | ✓ (`startsWith("//")` true) |
| 10 | `/?next=https://evil.com` | `/?next=https://evil.com` | ✓ (relative; `next` param uygulamada kullanılmıyor) |

## XSS

**PASS**

- `dangerouslySetInnerHTML` 1 callsite: `urunler/[slug]/page.tsx:259` JSON-LD — `<>&` unicode escape (Faz 16).
- Email template'lerin tümünde `escapeHtml()` (Faz 17).
- `innerHTML = ` raw atama yok.

## CSRF

**PASS**

- State-changing endpoint'ler hep POST/PATCH/DELETE (mutate-on-GET yok).
- NextAuth v5 default `SameSite=Lax`.
- Server Actions yok.

## File Upload

**PASS**

- 8MB cap (`uploads.ts:11`); image bulk 5MB cap.
- Magic-byte verify (`verifyMagicBytes`).
- Random filename (`crypto.randomBytes(12)`); Vercel Blob `addRandomSuffix: true`.
- Auth-gated download (`/api/dealer/documents/[id]/download`); blob URL client'a hiç gitmiyor.

## Path Traversal

**PASS**

- Doc download: `[id]` UUID, dosya adı user'dan alınmıyor; Blob URL whitelist regex.
- `accounting/export`: query param `type` enum (csv|xlsx); path construction yok.

## Prototype Pollution

**PASS**

- Zod `.passthrough()` / `.merge()` kullanımı yok (grep zero).
- Body parsing tüm endpoint'lerde Zod ile.
- `Object.assign({}, body)` desenli unguarded merge yok.

## Server Actions

**N/A** — `"use server"` direktifi sıfır kullanım. Tüm mutasyonlar API route'larda + role guard ilk satır.

---

## Yeni P2 / P3 (Bölüm 2'de bulundu)

| ID | Yer | Bulgu | Aksiyon |
|---|---|---|---|
| P2-A06-1 | `package.json` | `@hono/node-server` + `hono` moderate (`@prisma/dev` üzerinden) | `prisma` 6.19.3 (semver major) — Bölüm 3 Faz 4.7 |
| P2-A09-1 | `accounting/export/route.ts:34-41` | Bulk PII export audit log yok | `logAudit({action: "ACCOUNTING_EXPORT", metadata: {type, format, range, count}})` |
| P3-A05-1 | `next.config.ts:9` | CSP `'unsafe-inline'` script | nonce-based CSP (Next.js destek bekleniyor) |
| P3-A09-1 | `audit.ts:131` | Recursive sanitize depth/circular guard yok | `WeakSet` visited + max depth 8 |

---

## Test kanıtı

- `npx vitest run` — **159/159** ✓ (Bölüm 1 sonu baseline)
- `npx tsc --noEmit` — temiz
- `tests/safe-callback.test.ts` — 10 payload tüm pass
- `tests/security-r2.test.ts` — Faz 17 vektörler stabil
- `scripts/test-security-fixes.ts` — Faz 16 vektörler stabil

## Bölüm 3'e devir

- A06 vuln deps: `prisma` major upgrade Faz 4.7'de
- Server Actions adopte edilirse (gelecek refactor) origin check yeniden test edilmeli
- NextAuth v5 stable'a yükseltme
- Sentry/Logtail entegrasyonu sonrasında log redaction tekrar doğrula
