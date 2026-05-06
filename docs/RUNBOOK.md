# Master Education — Production Runbook

> Son güncelleme: 2026-05-06 (Bölüm 3)
> Hedef kitle: deploy/incident yetkilisi (geliştirici, sistem yöneticisi).

## 1. Pre-deploy checklist (canlıya çıkış ön koşulu)

### 1.1 Secrets & env

```bash
# Lokal kontrol — tüm zorunlu env'lerin doğruluğunu doğrular.
npx tsx scripts/check-prod-env.ts
```

Aşağıdaki anahtarlar **production env'de mutlaka set olmalı**:

| Key | Min uzunluk / Format | Kaynak |
|---|---|---|
| `DATABASE_URL` | `postgresql://…?sslmode=verify-full` | Neon / Supabase / RDS |
| `NEXTAUTH_SECRET` | 32+ char | `npx tsx scripts/generate-secret.ts` (üretir 64-char) |
| `NEXTAUTH_URL` | `https://mastereducation.com.tr` | sabit |
| `CRON_SECRET` | 32+ char | `generate-secret.ts` |
| `ADMIN_EMAIL` | gerçek posta | bayi başvuru, sistem alert |
| `SMTP_HOST/PORT/USER/PASS/FROM` | Resend | `smtp.resend.com:587` + API key |
| `BRAND_TAX_OFFICE` | metin | yasal — Mesafeli Sözleşme zorunlu |
| `BRAND_TAX_NUMBER` | 10–11 hane | yasal |
| `BRAND_MERSIS_NUMBER` | metin | yasal |
| `IYZICO_API_KEY` + `IYZICO_SECRET_KEY` | sandbox veya prod | https://merchant.iyzipay.com |
| `IYZICO_BASE_URL` | prod: `https://api.iyzipay.com` | yoksa default sandbox |
| `SHIPENTEGRA_API_KEY` + `SHIPENTEGRA_WEBHOOK_SECRET` | Shipentegra panel | https://shipentegra.com |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash | https://upstash.com |
| `SENTRY_DSN` | `https://<key>@<host>/<id>` | https://sentry.io |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token | `vercel env pull` |
| `ENABLE_MOCK_PAYMENTS` | **boş olmalı** | prod'da kapalı |
| `KOLAYBI_MOCK` | **boş olmalı** | prod'da kapalı |

### 1.2 Admin parolası

```bash
npx tsx scripts/change-admin-password.ts info@mastereducation.com.tr <yeni-parola>
```

Min 12 char + harf+rakam zorunlu. Default `admin@mastereducation.com.tr / admin123` mutlaka değişmeli.

### 1.3 Migration uygula

```bash
npx prisma migrate deploy
```

Drift varsa (Faz 8 senaryosu):

```bash
npx prisma db execute --file ./prisma/migrations/<NAME>/migration.sql
npx prisma migrate resolve --applied <NAME>
```

### 1.4 Build + smoke

```bash
npm run build                # prisma generate + next build
npm start                    # 3000 portunda dinler

# Başka terminalde:
npx tsx scripts/test-live-http.ts            # public route'ları smoke
npx tsx scripts/test-production-readiness.ts # P0/P1 hardening kontrol
npx tsx scripts/test-full-system-e2e.ts      # 3-persona e2e
```

Hepsi yeşil olmadan deploy yapma.

### 1.5 Canary trafik

Vercel Dashboard → Deployments → Promote to production seçeneği yerine **Rolling Release** ile %10 → %50 → %100 sızdırması önerilir (Vercel feature; GA Haziran 2025).

---

## 2. Deploy (normal akış)

### 2.1 Vercel

```bash
git push origin main         # GitHub Actions: lint + typecheck + vitest + playwright zorunlu yeşil
# Vercel Auto Deploy production branch'ten tetiklenir.
```

CI yeşil kanıtı:

```bash
gh run list --branch main --limit 5
gh run view <run-id>
```

### 2.2 Railway / Self-hosted (alternatif)

```bash
railway up --service master-education
railway run npx prisma migrate deploy
```

### 2.3 Domain & SSL

Vercel Dashboard → Domains → Add `mastereducation.com.tr` (CNAME `cname.vercel-dns.com`). Otomatik Let's Encrypt SSL.

---

## 3. Rollback

### 3.1 Acil: önceki deployment'a dön

Vercel Dashboard → Deployments → önceki yeşil → "Promote to Production".

CLI:

```bash
vercel rollback https://<previous-deployment-url> --token=$VERCEL_TOKEN
```

### 3.2 DB schema rollback

Migration'ları **geri sarmıyoruz** (Prisma'da reversible migration yok). Mantıksal rollback için:

```sql
-- Örn: Bölüm 3 P2-DB-2 (Order soft-delete) geri al
ALTER TABLE "orders" DROP COLUMN IF EXISTS "deletedAt";
DROP INDEX IF EXISTS "orders_deletedAt_idx";
```

Sonra `prisma migrate resolve --rolled-back <NAME>`.

### 3.3 Code rollback (git)

```bash
git revert <bad-commit>
git push origin main
```

`--force` push prod branch'inde **YASAK** (commit history korunur).

---

## 4. DB migrasyonları

### 4.1 Yeni migration ekle (interaktif yapmıyoruz)

```bash
# 1. Schema'yı düzenle
# 2. Migration dosyasını manuel oluştur:
mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_short_name
# 3. SQL yaz (CREATE TABLE / ALTER TABLE / CREATE INDEX)
# 4. Lokal uygula:
npx prisma db execute --file ./prisma/migrations/<NAME>/migration.sql
# 5. Migration history'ye işle:
npx prisma migrate resolve --applied <NAME>
# 6. Prisma client regenerate:
npx prisma generate
# 7. Test:
npx vitest run
npx tsc --noEmit
```

`prisma migrate dev` **kullanılmıyor** — searchDoc gibi `Unsupported("tsvector")` alanlar şemada yok ama DB'de var; interaktif modda drift hatası verir (Faz 8 notu).

### 4.2 Prod'a migration deploy

```bash
npx prisma migrate deploy   # idempotent; uygulanmamış migrationları sırayla atar
```

---

## 5. Secret rotation

### 5.1 NEXTAUTH_SECRET değiştir

**Etki**: tüm aktif session'lar invalidate olur (tüm kullanıcılar yeniden login). Düşük trafik penceresinde yap.

```bash
NEW=$(npx tsx scripts/generate-secret.ts)
vercel env rm NEXTAUTH_SECRET production
echo "$NEW" | vercel env add NEXTAUTH_SECRET production
vercel deploy --prod    # restart için
```

### 5.2 Iyzico key compromise

1. Iyzico merchant panel → API anahtarları → mevcut key'i revoke
2. Yeni key generate
3. `vercel env rm/add IYZICO_API_KEY production`
4. `vercel env rm/add IYZICO_SECRET_KEY production`
5. Production redeploy
6. **In-flight 3DS oturumlarını manuel kontrol** — eski key ile başlayan callback'ler signature mismatch ile düşer (kullanıcı 502 görür).

### 5.3 CRON_SECRET değiştir

Cron endpoint'leri `Authorization: Bearer <CRON_SECRET>` kullanır. Vercel Cron'u önce duraklat, env'i değiştir, sonra deploy + Vercel Cron yeniden enable.

---

## 6. Incident Response

### 6.1 Severity tanımları

| Sev | Tanım | Yanıt süresi | Örnek |
|---|---|---|---|
| **Sev1** | Tüm site indi / KVKK breach / payment kayıpta | <15 dk | DB unreachable, Iyzico key sızdı |
| **Sev2** | Kritik akış (checkout/login) bozuk | <1 saat | login 500, sepet çalışmıyor |
| **Sev3** | Sayfa/component tek-tek bozuk | <1 gün | bayi belge upload 500 |

### 6.2 Sev1 akışı

1. **Tespit**: UptimeRobot/BetterStack `/api/health` 503 alarmı veya Sentry P0 spike.
2. **Triage**: status page'i "investigating" yap (BetterStack).
3. **Triagedeki ilk 5 dk**:
   - `vercel logs <deployment-url> --follow` → son 5 dk hata pattern'i
   - `gh run list` → son merge'de regression var mı?
4. **Karar matrisi**:
   - Son deploy'dan kaynaklı: → **rollback** (3.1)
   - DB: → Neon/Supabase status sayfası, replica failover
   - 3rd party (Iyzico/Shipentegra): vendor status sayfası + magic OTP fallback
5. **Düzeltme + redeploy + verify** (`/api/health` 200 ve smoke test).
6. **Postmortem** (24 saat içinde) — `docs/incidents/<YYYY-MM-DD>-<short>.md`.

### 6.3 Sev2/Sev3

GitHub issue aç, bayrağı atayın (`severity-2` / `severity-3`), uygun sürede fix + deploy.

### 6.4 On-call kontak (örnek — gerçek kişiler ile doldurun)

| Rol | İsim | Telefon | Email |
|---|---|---|---|
| Birincil | _doldur_ | 0539 411 65 95 | info@mastereducation.com.tr |
| İkincil | _doldur_ | _doldur_ | _doldur_ |

### 6.5 Log + alert linkleri

- Vercel logs: `https://vercel.com/<team>/master-education/logs`
- Sentry: `https://sentry.io/organizations/<org>/projects/master-education/`
- Neon DB: `https://console.neon.tech/app/projects/<id>/branches`
- Status page: `https://status.mastereducation.com.tr` (BetterStack)
- Slack: `#me-prod-alerts` (Faz 4.6 webhook gönderir)

---

## 7. Health check (uptime monitor)

`/api/health` her 1 dk'da bir poll edilir. Response:

```json
{
  "status": "ok",
  "ts": "2026-05-06T19:15:33.412Z",
  "components": {
    "db": "ok",
    "email": "ok",
    "payment": "ok",
    "shipping": "ok",
    "sentry": "ok",
    "rateLimitBackend": "upstash"
  }
}
```

`db: "error"` → 503 ve Sev1 alert.
`payment: "not_configured"` + prod → kritik (Iyzico env unutulmuş).

---

## 8. Backup & restore

### 8.1 Otomatik

Neon: PITR (Point-In-Time Recovery) son 7 gün — tüm Free/Pro tier dahil. Pro tier'da 30 gün.

### 8.2 Manuel snapshot (haftalık)

```bash
pg_dump --no-owner --format=custom $DATABASE_URL > backups/me-$(date +%Y%m%d).dump
gpg --encrypt --recipient ops@mastereducation.com.tr backups/me-$(date +%Y%m%d).dump
# encrypted dump'ı S3 / Backblaze'e yükle
```

### 8.3 Restore tatbikatı

Çeyrek bir kez `docs/RECOVERY.md` adımları ile fresh DB üzerinde test edilir.

---

## 9. KVKK / DSAR akışı

KVKK Veri Sorumlusu Sicili (VERBİS) kayıtlı. Talep formları:

- **Web**: `/kvkk-basvuru` formu — `KvkkApplication` tablosuna düşer
- **Email**: `info@mastereducation.com.tr` (admin paneline manuel kopya)

SLA: **30 gün** (KVKK m.13). Admin paneli `/admin/kvkk-basvurulari` üzerinden:

- "Veri ihracı" → `KvkkApplication` ID'sine ait kullanıcı verilerini Excel olarak indir
- "Veri silme" → sipariş yoksa hard delete; varsa `anonymizeUser()` (Faz 7)

Çerez kategorileri (`/cerez-politikasi`):

- Zorunlu (session, csrf) — onay aranmaz
- Analitik (Vercel Analytics) — opt-in
- Pazarlama — opt-in (varsayılan kapalı)

---

## 10. Pre-deploy son kontrol (10 madde)

```text
[ ] 1. NEXTAUTH_SECRET 32+ char (generate-secret.ts)
[ ] 2. Admin password değiştirildi (change-admin-password.ts)
[ ] 3. ADMIN_EMAIL gerçek posta kutusu
[ ] 4. NEXTAUTH_URL prod domain (https://...)
[ ] 5. ENABLE_MOCK_PAYMENTS boş (kapalı)
[ ] 6. RESEND_API_KEY + IYZICO_*  + SHIPENTEGRA_* + SENTRY_DSN + BLOB_* + CRON_SECRET set
[ ] 7. BRAND_TAX_OFFICE / TAX_NUMBER / MERSIS_NUMBER dolu (yasal)
[ ] 8. npx prisma migrate deploy clean
[ ] 9. npx tsx scripts/check-prod-env.ts → ✅
[ ] 10. Build + smoke (test-live-http + test-production-readiness + test-full-system-e2e) 100%
```

Hepsi tikli olmadan deploy yapma.
