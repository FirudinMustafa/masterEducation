# Production Audit — Bölüm 2 (Admin + Bayi + DB + Security)

> **Kapsam**: `src/app/admin/**`, `src/app/api/admin/**`, `src/app/bayi/**`, Prisma schema/migrations, OWASP ASVS L2 tur 3.
> Faz 4 entegrasyonları + final QA — **Bölüm 3**.
> Baseline: 2026-05-06 — vitest 159/159 + tsc temiz, Bölüm 1 P1 fix'leri uygulandı (commit `c716e2f`).

## Metodoloji

Bölüm 1 ile aynı: statik + dinamik + regresyon, P0→P3, atomik commit, `tsc --noEmit` + `vitest run` her dokunuşta yeşil.

## Skor

| Bölge | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Admin paneli (sayfa) | 0 | 0 | 0 | 0 |
| Admin API (50 endpoint) | 0 | 0 | 1 | 4 |
| Bayi paneli + API | 0 | 0 | 1 | 1 |
| Prisma schema/DB | 0 | 0 | 3 | 4 |
| OWASP tur 3 | 0 | 0 | 2 | 2 |
| **TOPLAM** | **0** | **0** | **7** | **11** |

> Bölüm 2'de **P0/P1 yok** — Faz 16+17 + Bölüm 1 sonrası güvenlik yüzeyi tertemiz.
> Mevcut bulguların tamamı operasyonel/perf/compliance kategorisinde.

---

## P2 — 7 madde (önemli, prod'a engel değil)

### P2-API-1 — `accounting/export` audit log eksik
**Yer**: `src/app/api/admin/accounting/export/route.ts:34-44`
**Belirti**: GET endpoint tüm sipariş + kullanıcı (PII) ihraç ediyor. `requireRole` ✓ ama `logAudit` yok.
**Risk**: KVKK + iç soruşturma; admin ne ihraç etti izlenmiyor.
**Fix**: response öncesi `logAudit({action: "ACCOUNTING_EXPORT", metadata: {type, format, from, to, orderCount: orders.length}})`.
**Doğrulama**: AuditLog tablosu manuel sorgu — bu commit ile.
**Status**: _bu turda fix uygulandı_ (commit aşağıda)

### P2-BAYI-1 — `/bayi/siparisler` N+1 risk
**Yer**: `src/app/bayi/siparisler/page.tsx:15-29`
**Belirti**: `prisma.order.findMany({ include: { items: { include: { product: { select: { name: true } } } } } })` — N+1 (Prisma genelde JOIN kullanır ama bayi'de yüzlerce sipariş varsa hot path).
**Risk**: Listing yavaşlığı (>100 sipariş + ortalama 5 item).
**Onarım**: pagination (Faz 12 admin tarafında var; bayi listesinde de eklenmesi).
**Doğrulama**: 200 sipariş seed + `EXPLAIN ANALYZE`.

### P2-DB-1 — `searchDoc` Prisma şemasında yok
**Yer**: `prisma/schema.prisma` Product model (line 166-201) `searchDoc` field yok; migration `20260422040000_add_product_search/migration.sql` ile DB'ye eklenmiş.
**Belirti**: `prisma migrate dev` interaktif modda drift hatası verir (Faz 8 notunda kanıt). Şu anki workflow `db execute` + `migrate resolve --applied` ile manuel.
**Risk**: Yeni geliştiricinin `migrate dev` çalıştırması başarısız olur. CI'da migrate dev kullanılırsa kırılır.
**Onarım**: Product modeline `searchDoc Unsupported("tsvector")?` field ekle (Prisma 7 generated column desteği). VEYA `@@ignore` ile mevcut workflow'u doğrudan dokümante et.
**Status**: P2 olarak Bölüm 3'e ertelenir — DB değişiklik riski; canlı DB üzerinde dikkatli test.

### P2-DB-2 — Soft vs hard delete tutarsızlığı (Order/Review hard, Product soft)
**Yer**: `prisma/schema.prisma` — Order ve Review hard-delete; Product `isPublished=false` soft.
**Belirti**: KVKK + denetim için sipariş kaydı silinince geriye iz kalmaz. `users/[id]` DELETE'te siparişi olan user anonymize edilir (Faz 7) → Order satırları kalır ama bu admin'in `prisma.order.delete()` yapmasını engellemez.
**Risk**: Sipariş silme kazara veri kaybı + denetim uyumsuzluğu.
**Onarım**: Order modeline `deletedAt DateTime?` + admin endpoint'lerinde hard `delete` yerine `update({deletedAt})`. Veya `RESTRICT` constraint.

### P2-DB-3 — `DealerLedger(dealerId, createdAt DESC)` composite index yok
**Yer**: `prisma/schema.prisma` DealerLedger model (~line 600).
**Belirti**: `(dealerId)` ve `(createdAt)` ayrı index'ler var, ama statement page `WHERE dealerId=? ORDER BY createdAt DESC` sorgusu için composite daha verimli.
**Risk**: 10K+ ledger entry'lerde planning + IO.
**Onarım**: `@@index([dealerId, createdAt(sort: Desc)])` migration.

### P2-A06-1 — `npm audit` 3 moderate (dev-only)
**Yer**: `package.json` → `@prisma/dev` → `@hono/node-server`, `hono`.
**Belirti**: Path traversal + JSX HTML injection moderate. Dev-only bağımlılık; runtime risk yok.
**Onarım**: `prisma` 6.19.3 (semver major). Bölüm 3 Faz 4.7 deploy hazırlığında yapılmalı.

### P2-A09-1 — `accounting/export` audit log eksik
P2-API-1 ile aynı, security tarafında.

---

## P3 — 11 madde

| ID | Yer | Bulgu | Aksiyon |
|---|---|---|---|
| P3-API-1 | `products/bulk-upload-images/route.ts:78` | Admin rate-limit yok (DoS düşük; sadece kendine zarar) | `bulk-image-upload:<userId>` 10/dk |
| P3-API-2 | `dealers/[id]` PATCH | SUSPENDED bayi field'larını edit edebiliyor | status check + 409 |
| P3-API-3 | `users/bulk-delete` | Bulk'ta last-admin guard yok (single-delete'te var) | pre-flight count check |
| P3-API-4 | bulk endpoint'lerin audit metadata'sı | Büyük `patch`/array log'lanıyor | sample 20 ID + key list |
| P3-DB-1 | `AuditLog(action)` | Admin "filter by action" sorgusu için index yok | `@@index([action])` |
| P3-DB-2 | `Review(productId, status)` | Admin moderation `WHERE status=PENDING` per-product | composite index |
| P3-DB-3 | `OrderEvent(actorId)` | Admin timeline | index |
| P3-DB-4 | `Dealer(status)` | Dashboard `WHERE status=APPROVED` | index |
| P3-A05-1 | `next.config.ts:9` | CSP `'unsafe-inline'` script | nonce-based CSP (gelecek) |
| P3-A09-1 | `audit.ts:131` recursive | Circular ref/depth guard yok | WeakSet + max depth 8 |
| P3-BAYI-1 | `dealer/documents` upload `origName` | `.replace(/[\/\\]/g, '_')` yok (download'da escape var) | filename normalize |

---

## Uygulanan fix'ler (bu commit)

| ID | Fix | Commit |
|---|---|---|
| P2-API-1 / P2-A09-1 | `accounting/export` audit log | _aşağıda_ |
| Yeni audit action `ACCOUNTING_EXPORT` | `audit.ts` | _aşağıda_ |

P3'lerin çoğu Bölüm 3 deploy hazırlığında batch-fix.

---

## Bölüm 3'e devir notu

### Kapsam (Bölüm 3 odakları)
1. **Faz 4 entegrasyonları**:
   - 4.1 SMTP/Resend canlı doğrulama (Bölüm 1: misconfig tespiti aktif)
   - 4.2 Iyzico/Param sandbox + signature verify
   - 4.3b Shipentegra adapter
   - 4.4 Upstash Redis rate-limit (in-memory'den geçiş)
   - 4.6 Sentry/Logtail observability
   - 4.7 Vercel deploy + cron + custom domain + SSL
2. **Final QA** (5 günlük sprint):
   - End-to-end Playwright golden path × 3 persona (misafir, üye, bayi)
   - Loading skeleton + error boundary + 404 patikası tüm route'larda görsel doğrulama
   - Mobile (375), tablet (768), desktop (1280) responsive denetim
   - A11y: tab nav, focus ring, screen reader (NVDA+VoiceOver smoke)
   - Performance: Lighthouse 90+ tüm sayfalarda
   - Bundle size: tree-shake unused; Next 16 turbopack analizi
3. **Operasyonel deploy runbook** (Bölüm 1'de zaten yazıldı; Bölüm 3'te genişletilecek)
4. **Bölüm 1 + Bölüm 2 P2/P3 batch fix'i** — özellikle:
   - Order soft-delete migration (P2-DB-2)
   - DealerLedger composite index (P2-DB-3)
   - searchDoc schema sync (P2-DB-1)
   - 4 missing index (P3-DB-1..4)
   - bulk endpoint per-admin rate-limit (P3-API-1)
5. **NextAuth v5 stable'a yükseltme** (beta'dan çıkar çıkmaz)
6. **Bölüm 1'in 2 bekleyen P1'i**:
   - P1-PAGE-2: emailVerified guard kararı (UX)
   - P1-DEPLOY-2: Redis rate-limit (4.4 ile)

### Test eklemeleri (Bölüm 3)
- `tests/audit-actions.test.ts` — yeni `ACCOUNTING_EXPORT` action
- `scripts/test-bayi-orders-pagination.ts` — P2-BAYI-1
- `scripts/test-bulk-image-upload-rate-limit.ts` — P3-API-1
- DB perf: `scripts/explain-statement-query.ts`, `scripts/explain-audit-filter.ts`

### Yapısal kararlar (UX'ten beklenen)
- **emailVerified zorunluluğu**: CUSTOMER login'de zorunlu mu? Bölüm 3 başında karar.
- **Order soft-delete**: yasal saklama süresi ne? (Türkiye'de 10 yıl) — soft + cron arşiv?
- **Bayi statement pagination**: limit?

---

## Test baseline (Bölüm 2 sonu)

- `npx vitest run` — **159/159** ✓
- `npx tsc --noEmit` — temiz
- `npm audit --omit=dev` — 3 moderate (dev-only, P2-A06-1)
- Layout-level admin gate ✓
- 45/45 admin endpoint `requireRole("ADMIN")` ✓
- 11/11 bulk endpoint MAX_AFFECTED + Zod array.max() ✓
- Faz 16+17 + Bölüm 1 vektörlerinin tamamı stabil
