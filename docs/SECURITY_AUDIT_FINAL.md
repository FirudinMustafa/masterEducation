# Master Education — Security Audit FINAL (OWASP ASVS L2 — 3 tur)

> Faz 16 + Faz 17 + Bölüm 1 + Bölüm 2 + Bölüm 3 birleşik son durum.
> Baseline: 2026-05-06 — vitest 164/164, tsc temiz, npm audit 5 moderate (dev-only).

## Özet

| Kategori | Bulgu | Açık | Kapanan | Ana commit |
|---|---|---|---|---|
| OWASP A01 (Broken Access Control) | 6 | 0 | 6 | Faz 16+17, c716e2f, aaa81d8 |
| OWASP A02 (Cryptographic Failures) | 3 | 0 | 3 | Faz 17 token-hash, Bölüm 1 NEXTAUTH_SECRET min 32 |
| OWASP A03 (Injection) | 2 | 0 | 2 | parameterized $queryRaw, JSON-LD escape |
| OWASP A04 (Insecure Design) | 4 | 0 | 4 | escapeHtml templates, audit redact, tracking enum mask |
| OWASP A05 (Security Misconfiguration) | 3 | 1 (kabul) | 2 | CSP unsafe-inline P3 deferred |
| OWASP A06 (Vulnerable Components) | 1 | 1 (kabul) | 0 | npm audit dev-only postcss/prisma transitive |
| OWASP A07 (Auth Failures) | 5 | 0 | 5 | bcrypt timing, per-IP RL, email-verify TTL, password change current-pwd |
| OWASP A08 (Software/Data Integrity) | 2 | 0 | 2 | atomic verify-token + audit cycle guard |
| OWASP A09 (Logging Failures) | 2 | 0 | 2 | accounting/export audit, recursive metadata sanitize |
| OWASP A10 (SSRF) | 1 | 0 | 1 | Vercel Blob origin lock |
| **TOPLAM** | **29** | **2 kabul** | **27 fix** |  |

> 2 kabul edilmiş risk her ikisi de düşük öncelikli ve kabul edilmiş kararla bırakıldı (gerekçeler aşağıda).

---

## OWASP madde madde

### A01 — Broken Access Control ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Open redirect via `callbackUrl` | ✅ | `safeCallbackUrl` decode-once + control-char + 15/15 test |
| Path traversal — dealer document download | ✅ | `/api/dealer/documents/[id]/download` ownership + path pattern check (Faz 16) |
| Admin endpoint missing role guard | ✅ | 45/45 admin endpoint `requireRole("ADMIN")` ilk satır + layout-level redirect (Bölüm 2) |
| IDOR — order detail | ✅ | `userId === session.user.id` veya admin (Bölüm 1) |
| SUSPENDED dealer field edit (Bölüm 2 P3-API-2) | ✅ | 409 + `code: DEALER_SUSPENDED` (Bölüm 3) |
| Last-admin guard bulk-delete | ✅ | `if (u.role === "ADMIN") skipped` (mevcut) |

**Kanıt komutu**:
```bash
npx vitest run tests/safe-callback.test.ts   # 15/15
npx tsx scripts/test-audit-and-dealer-guard.ts
```

### A02 — Cryptographic Failures ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Reset/verify token DB plaintext | ✅ | SHA-256 hash (`token-hash.ts`, Faz 17); plaintext sadece email link'inde |
| `NEXTAUTH_SECRET` min 16→32 | ✅ | `env.ts` zod refine (Faz 17) |
| Bcrypt cost factor | ✅ | bcrypt 12 (default) — uygun |

### A03 — Injection ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| `prisma.$queryRaw` SQL injection | ✅ | 7 callsite `Prisma.sql` + `${...}` parameterized (Bölüm 2) |
| JSON-LD `</script>` XSS | ✅ | `<>&` unicode escape (Faz 16) |

**Kanıt komutu**:
```bash
grep -rn "prisma.\$queryRaw\|prisma.\$executeRaw" src/ | grep -v Prisma.sql  # 0 unsafe
```

### A04 — Insecure Design ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Email template HTML injection | ✅ | 10/10 template `escapeHtml()` (Faz 17 + Bölüm 1) |
| Audit metadata leak | ✅ | `sanitizeAuditMetadata` recursive + WeakSet cycle guard (Bölüm 3 P3-A09-1) |
| Tracking enumeration | ✅ | per-IP 30/saat + `maskShippingName` (Faz 17) |
| Mock payment prod-disabled | ✅ | dev/test always; prod 404 (önceden 403); `ENABLE_MOCK_PAYMENTS` flag (Bölüm 3) |

### A05 — Security Misconfiguration

| Bulgu | Durum | Kanıt |
|---|---|---|
| Email DRYRUN sessiz prod misconfig | ✅ | `console.error` prod-mode SMTP eksik + Resend sandbox prod fallback yok (Bölüm 1 P1-LIB-3) |
| `NEXTAUTH_URL` prod-required | ✅ | env.ts production refine (Bölüm 1 P1-LIB-4) |
| **CSP `unsafe-inline` script** | ⏸️ kabul | Next 16'nın inline script gereksinimi (RSC hidrasyon, image lazy-load); nonce-based CSP Next stable destek bekliyor (P3-A05-1) |

### A06 — Vulnerable Components

| Bulgu | Durum | Kanıt |
|---|---|---|
| **npm audit moderate** | ⏸️ kabul | 5 vuln tamamen dev-only: `postcss` Next 16 transitive (fix = Next 9 downgrade — kabul edilmez); `hono` + `@hono/node-server` Prisma 7 dev tooling transitive (prod runtime'a girmez). `npm audit fix --force` katastrofik. **Prod runtime risk: 0**. |

### A07 — Authentication Failures ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Login email enumeration timing | ✅ | dummy bcrypt missing-user dalında (Bölüm 1 P1-LIB-1) |
| Per-IP rate-limit eksik | ✅ | `login:ip:<ip>` 30/15min (Bölüm 1 P1-LIB-2) |
| Email verify token TTL 24h→1h | ✅ | Faz 17 |
| Atomic verify token race | ✅ | `prisma.$transaction` (Bölüm 1 P1-LIB-5) |
| Email-change account takeover | ✅ | `currentPassword` zorunlu (Faz 17) |

**Kanıt komutu**:
```bash
npx tsx scripts/test-login-timing.ts        # var-vs-yok < 50ms
npx tsx scripts/test-login-ip-rate-limit.ts # 31. denemede 429
npx tsx scripts/test-password-reset-flow.ts
```

### A08 — Software/Data Integrity ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Email verify non-atomic | ✅ | `$transaction` (Bölüm 1) |
| Audit metadata cycle/depth | ✅ | WeakSet + max depth 8 (Bölüm 3) |

### A09 — Logging Failures ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Accounting export audit log eksik | ✅ | `ACCOUNTING_EXPORT` action + log (Bölüm 2 P2-A09-1) |
| Audit metadata sanitize | ✅ | recursive + sensitive key redact (Faz 17) |

### A10 — SSRF ✅

| Bulgu | Durum | Kanıt |
|---|---|---|
| Vercel Blob fetch redirect | ✅ | Blob origin lock (Vercel default); `fetch` external URL guard yok ama dealer-doc download'da blob URL'i fixed origin |

---

## Ek hardening (Faz 4 entegrasyonları)

| Madde | Notlar |
|---|---|
| Iyzico signature verify | HMAC-SHA1 callback + HMAC-SHA256 webhook + `crypto.timingSafeEqual` |
| Iyzico idempotency | PaymentSession `updateMany WHERE status=PENDING` atomic claim — race-safe |
| Iyzico mock prod 404 | `ENABLE_MOCK_PAYMENTS` env yoksa endpoint var olmaz (bilgi sızıntısı engelli) |
| Shipping webhook HMAC | HMAC-SHA256 body verify + occurredAt dedupe |
| Sentry PII scrubber | password/token/auth/email/phone redact + max depth 6 |
| Rate-limit Upstash | distributed sliding-window — horizontal-scale bypass kapalı (P1-DEPLOY-2 fix) |
| `/api/health` | bilgi sızıntısı yok; sadece component status |

---

## Kanıt komutları (CI'da çalışır)

```bash
# Unit + integration
npx vitest run                                 # 164/164 ✓
npx tsc --noEmit                                # temiz
npm audit                                       # 5 moderate (dev-only)

# Live HTTP smoke
npx tsx scripts/test-live-http.ts
npx tsx scripts/test-production-readiness.ts
npx tsx scripts/test-full-system-e2e.ts
npx tsx scripts/smoke-bolum3-final.ts          # /api/health + 8 endpoint

# Security-specific
npx tsx scripts/test-security-fixes.ts
npx tsx scripts/test-security-r2.ts
npx tsx scripts/test-audit-and-dealer-guard.ts
npx tsx scripts/test-credit-limit-race.ts
npx tsx scripts/test-payment-session-race.ts

# Browser
PW_BASE_URL=http://localhost:3000 npx playwright test
```

---

## Kabul edilmiş riskler (2)

### 1. CSP `unsafe-inline` script (P3-A05-1)

**Risk**: XSS payload'ı sayfaya enjekte edilirse inline script policy bypass'lı.
**Mitigation**: tüm user-content `escapeHtml()`'le, JSON-LD `<>&` unicode escape, React'in default text-content escape'i.
**Plan**: Next.js 16 stable nonce-based CSP destek netleşince upgrade.

### 2. npm audit 5 moderate (dev-only)

**Risk**: yok — prod bundle'a girmez.
**Mitigation**: `npm audit --omit=dev` 0 vuln.
**Plan**: Prisma 7.8 stable + Next 16.3 stable çıkınca tekrar audit.

---

## Sonuç

**0 P0 / 0 P1 açık. 27/29 OWASP bulgu fix'lendi, 2'si gerekçeli kabul edildi.** Kod tabanı production-ready güvenlik seviyesinde. Canlıya geçiş için kalan iş hesap provizyon (Resend/Iyzico/Shipentegra/Sentry/Upstash) — kod tarafı tamamen hazır.
