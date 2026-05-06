# Master Education — Disaster Recovery

> Son güncelleme: 2026-05-06 (Bölüm 3)
> Eşlik eden: `docs/RUNBOOK.md` (operasyonel akış).

## 1. RTO / RPO hedefleri

| Senaryo | RTO (toparlanma) | RPO (veri kaybı toleransı) |
|---|---|---|
| Vercel deploy bozuk | 5 dk (rollback) | 0 |
| DB tek-tablo bozulması | 30 dk | <5 dk (Neon PITR) |
| DB tam çökme | 1 saat | <5 dk (Neon PITR) + 1 gün (manual dump) |
| Vercel Blob veri kaybı | 4 saat | dump → re-upload |
| Sızdırılmış admin | 15 dk (revoke + rotate) | varsa data export ile incele |

---

## 2. Senaryolar & playbook'lar

### 2.1 Veri kaybı (data loss / accidental delete)

**Tespit**: kullanıcı şikayeti, missing rows, audit log farkı.

**Adım 1 — durdur**: ilgili admin endpoint'i geçici olarak feature flag ile kapat (env var → restart).

**Adım 2 — kapsam tespit**:

```sql
-- Hangi tablo ve aralıkta kayıp var?
SELECT count(*) FROM orders WHERE "createdAt" > NOW() - INTERVAL '2 hours';
SELECT count(*) FROM audit_logs WHERE action='ORDER_STATUS_CHANGE' AND "createdAt" > NOW() - INTERVAL '2 hours';
```

**Adım 3 — Neon PITR**:

1. Neon Console → Branches → "Restore" → noktayı seç (örn. olaydan 5 dk önce).
2. Restore yeni branch'e: `recovery-2026-05-06`.
3. Recovery branch'inden eksik satırları COPY ile prod'a aktar:

```bash
pg_dump --table='orders' --where="\"createdAt\" > '2026-05-06 14:00'" \
  postgres://...recovery-branch... > recovered.sql
psql postgres://...prod... < recovered.sql
```

**Adım 4 — postmortem**: `docs/incidents/2026-05-06-data-loss.md` (root cause + prevention).

---

### 2.2 Charge-back / dispute (Iyzico)

**Tespit**: Iyzico panelinde dispute notification.

**Adım 1**: Order ID'yi audit'ten bul:

```sql
SELECT * FROM audit_logs WHERE metadata->>'paymentId' = '<iyzico-payment-id>';
SELECT * FROM orders WHERE id = '<order-id>';
SELECT * FROM order_events WHERE "orderId" = '<order-id>' ORDER BY "createdAt";
```

**Adım 2**: Mesafeli Sözleşme + IP + zaman damgası (`contractsAcceptedAt`/`contractsAcceptedIp`) + kargo teslim onayı (`deliveredAt`) → kanıt paketi hazırla.

**Adım 3**: Iyzico merchant panel → Dispute → kanıt PDF/screenshot upload.

**Adım 4**: Order status `REFUNDED` veya `CANCELLED` (iade kabul edilmişse stok geri yükle).

---

### 2.3 Compromised admin account

**Tespit**: anormal admin aktivitesi (audit log spike), geç saatte login, IP coğrafi anomali.

**Adım 1 — anlık** (15 dk içinde):

```bash
# Admin user'ı suspend et
npx tsx -e "import {prisma} from './src/lib/prisma'; await prisma.user.update({where:{email:'<addr>'},data:{role:'CUSTOMER',passwordHash:'!INVALID'}})"
# Tüm session'ları invalidate
NEW=$(npx tsx scripts/generate-secret.ts)
vercel env rm NEXTAUTH_SECRET production
echo "$NEW" | vercel env add NEXTAUTH_SECRET production
vercel deploy --prod
```

**Adım 2 — soruşturma**:

```sql
SELECT action, "entityType", "entityId", metadata, "createdAt"
FROM audit_logs
WHERE "actorId" = '<admin-user-id>'
  AND "createdAt" > '2026-05-06 00:00'
ORDER BY "createdAt" DESC LIMIT 200;
```

Hangi sipariş/ürün/kullanıcı değiştirilmiş? `metadata` farkından geri al (manuel SQL).

**Adım 3 — KVKK ihbar**: KVKK m.12 — kişisel veri ihlal şüphesi → 72 saat içinde KVK Kurumu'na bildir + ilgili kişilere bildirim.

---

### 2.4 Leaked secret (env'de credential sızdı)

**Tespit**: GitHub secret scanning, harici tip-off, audit anomalisi.

**Anında**:

| Secret | Aksiyon |
|---|---|
| `NEXTAUTH_SECRET` | rotate (5.1 RUNBOOK) — tüm session geçersiz |
| `IYZICO_API_KEY` | Iyzico panel revoke + new key + redeploy |
| `IYZICO_SECRET_KEY` | aynı şekilde |
| `RESEND_API_KEY` | Resend panel revoke + new + redeploy |
| `SHIPENTEGRA_API_KEY` | Shipentegra panel revoke + new + redeploy |
| `BLOB_READ_WRITE_TOKEN` | Vercel Storage → Connect Store → Reset token |
| `DATABASE_URL` (parola) | Neon/Supabase user password rotate |
| `CRON_SECRET` | regenerate + Vercel Cron yeniden enable |

**Sonra**: `git log` taraması (sızıntı commit'i kalmış mı), `.env*` audit, GitHub secret scanning enable.

---

### 2.5 DB corruption

**Tespit**: Neon dashboard error, queries hang, integrity check fail.

**Adım 1 — read-only**: app'i bakım moduna al (env flag → middleware "503 Bakım").

**Adım 2 — restore from PITR** (örn. 30 dk önce):

```bash
# Neon CLI
neonctl branches create --name recovery-$(date +%s) \
  --parent main --timestamp '2026-05-06 14:30:00'
# DSN'yi kopyala, app env'ini geçici olarak yeni branch'e yönlendir.
```

**Adım 3 — doğrula**:

```bash
npx tsx scripts/verify-counts.ts   # tablo satır sayıları
npx tsx scripts/test-live-http.ts  # public smoke
```

**Adım 4 — promote**: doğrulanan recovery branch'i prod main yap (Neon "Promote branch").

---

## 3. Backup tatbikatı (çeyrek bir kez)

Tatbikatın 5 adımı:

1. **prod-like dump al**: `pg_dump --no-owner --format=custom $PROD_URL > recovery-test.dump`
2. **fresh DB hazırla**: yeni Neon branch (boş schema)
3. **restore**: `pg_restore --no-owner -d $TEST_URL recovery-test.dump`
4. **seed**: `npx tsx prisma/seed.ts` (smoke data)
5. **smoke test**: `DATABASE_URL=$TEST_URL npx tsx scripts/test-live-http.ts`

Her tatbikat sonucu aşağıdaki tabloya işle:

### 3.1 Tatbikat geçmişi

| Tarih | Tatbikatçı | Süre | Bulgular | Aksiyon |
|---|---|---|---|---|
| 2026-05-06 | Bölüm 3 audit | _planlandı_ | _ilk tatbikat prod canary öncesi yapılacak_ | runbook.md hazır |

> **Not**: bu tablodaki ilk gerçek tatbikat, prod'a deploy'dan önce çalıştırılmalıdır. RTO 1 saat hedefi pratikte ölçülür, doğrulanmadıkça hedef teorik kalır.

---

## 4. İletişim plan (incident sırasında)

### 4.1 İç iletişim

- Slack `#me-prod-alerts` — sev1/sev2 otomatik alert (Faz 4.6 webhook).
- Telefon — birincil on-call (`0 539 411 65 95`).

### 4.2 Dış iletişim

- **Status page** (BetterStack): `https://status.mastereducation.com.tr` — sev1 başlamadan önce "investigating".
- **Müşteri email**: 4 saatten uzun sürerse `info@mastereducation.com.tr` üzerinden mass-email (sadece etkilenen kullanıcılara).
- **KVKK ihbar** (m.12): kişisel veri ihlali şüphesi → 72 saat içinde Kurum + etkilenen kişiler.

---

## 5. Bilinen tek noktalar (single points of failure)

- **Neon DB**: ana branch — replica yok (Neon Pro tier'da read-replica option). Failover: PITR + branch restore (RTO 30 dk).
- **Vercel**: build + edge — Vercel'in kendi outage'ı durumda site indi (status.vercel.com).
- **Iyzico**: ödeme tek-vendor. Alternatif PSP (PayTR/Craftgate) entegre edilmeli (Faz 5+).
- **Shipentegra**: hub'ı kendisi outage olursa kargo otomatik oluşmaz; manuel carrier API'lara fallback dokümante edilmeli (gelecek).
