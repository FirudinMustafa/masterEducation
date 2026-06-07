# Master Education — Hostinger KVM 4 VPS Deploy Rehberi

> Bu doküman **deploy taslağı**dır. Komutlar çalıştırılmadan önce VPS keşfi yapılmalı (bkz. §0). Komutlardaki port (3001), DB adı, yol gibi yer-tutucular gerçek durum bilindiğinde güncellenir.

**Hedef:** `mastereducation.com.tr` → Hostinger KVM 4 VPS (IP **76.13.56.103**), aynı host üzerinde `okultedarigi.com` zaten üretimde. **`okultedarigi`'a hiçbir koşulda dokunulmaz.**

**Topoloji:**
```
                                    ┌────────────────────────────────────────┐
   Internet  ─────►  nginx (443)  ──┤                                        │
   (Let's Encrypt SSL)              ├─► mastereducation.com.tr → 127.0.0.1:3001 (PM2 fork, instances:1)
                                    ├─► okultedarigi.com       → 127.0.0.1:xxxx (DOKUNMA)
                                    └────────────────────────────────────────┘
                                              │
                                              ▼
                                    Shared PostgreSQL (localhost:5432)
                                       ├── master_education     (yeni)
                                       └── okultedarigi         (mevcut, DOKUNMA)
```

---

## 0. VPS keşfi (deploy ÖNCESİ zorunlu)

Bu adım manuel oturumda yapılır. Sonuçlara göre §3 / §4'teki port ve yol değerleri güncellenir.

```bash
# SSH
ssh root@76.13.56.103

# nginx kurulu mu, configleri nerede?
nginx -v
ls /etc/nginx/sites-enabled/

# okultedarigi'nin port ve PM2 adı (DOKUNMA — sadece OKU)
pm2 list

# Postgres versiyon + erişim
psql --version
sudo -u postgres psql -c "\du"
sudo -u postgres psql -c "\l"

# Boş port bul (3001 önerisi; çakışırsa 3002, 3003 ...)
ss -ltnp | grep ':30'

# Node + npm
node -v
npm -v
pm2 -v

# Disk + RAM
df -h
free -h
```

**Çıktıları topla:** mevcut PM2 isim/port'u, kullanılabilir port, Postgres ana sürümü, nginx config klasörü, çalışan kullanıcı (genelde `www-data` veya özel uygulama kullanıcısı).

---

## 1. Postgres setup (yeni DB + ayrı kullanıcı)

> `okultedarigi`'nin DB'sine yaklaşma. Sadece yeni `master_education` veritabanı.

```bash
sudo -u postgres psql

-- Üretim kullanıcısı (parolayı `openssl rand -base64 32` ile üret)
CREATE USER master_education_user WITH PASSWORD '<YENI-PAROLA>';

-- DB
CREATE DATABASE master_education OWNER master_education_user;

-- Şema izinleri
\c master_education
GRANT ALL ON SCHEMA public TO master_education_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO master_education_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO master_education_user;

\q
```

Test bağlantısı:
```bash
psql -U master_education_user -h localhost -d master_education -c "SELECT current_database();"
```

DATABASE_URL formatı (URL-encode parola):
```
postgresql://master_education_user:<urlencoded-parola>@localhost:5432/master_education?sslmode=disable
```

> SSL: yerel TCP (`localhost`) bağlantısında `sslmode=disable` kabul. Internet üzerinden Postgres'e dokunulmaz.

---

## 2. Sistem kullanıcısı ve repo dizini

```bash
# (Mevcut deployment user varsa onu kullan; aksi halde:)
sudo useradd -m -s /bin/bash mastereducation
sudo -u mastereducation -i

cd ~
git clone <repo-url> master-education
cd master-education
git checkout main

# Node 20+ ve PM2 globally gerekli
node -v   # >= v20
npm -v
which pm2 || sudo npm i -g pm2
```

---

## 3. `.env.production` şablonu

> Sırları **VPS dosyasında** sakla. Repo'ya hiçbir koşulda commitleme.

`~/master-education/.env.production`:
```env
# ─── App
NODE_ENV=production
PORT=3001                    # §0'da boş port netleşince güncelle
NEXTAUTH_URL=https://mastereducation.com.tr
NEXTAUTH_SECRET=<openssl rand -hex 32 >= 32 char>

# ─── Database
DATABASE_URL=postgresql://master_education_user:<urlencoded-parola>@localhost:5432/master_education?sslmode=disable
DATABASE_URL_UNPOOLED=postgresql://master_education_user:<urlencoded-parola>@localhost:5432/master_education?sslmode=disable

# ─── Cron
CRON_SECRET=<openssl rand -hex 32 >= 16 char>

# ─── Email (Resend prod)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<Resend API key — re_xxx>
SMTP_FROM="Master Education <no-reply@mastereducation.com.tr>"
ADMIN_EMAIL=info@mastereducation.com.tr
ACCOUNTING_EMAIL=muhasebe@mastereducation.com.tr
EMAIL_LOGO_URL=https://mastereducation.com.tr/email-logo.png

# ─── Iyzico (prod)
IYZICO_BASE_URL=https://api.iyzipay.com
IYZICO_API_KEY=<merchant panel>
IYZICO_SECRET_KEY=<merchant panel>
# Mock KAPALI
ENABLE_MOCK_PAYMENTS=

# ─── KolayBi (prod)
KOLAYBI_BASE_URL=https://ofis-api.kolaybi.com
KOLAYBI_API_KEY=<kolaybi panel>
KOLAYBI_CHANNEL=<kolaybi panel>

# ─── Shipentegra (prod)
SHIPENTEGRA_API_KEY=<panel>
SHIPENTEGRA_WEBHOOK_SECRET=<panel>

# ─── Vercel Blob
BLOB_READ_WRITE_TOKEN=<vercel blob token>
NEXT_PUBLIC_BLOB_BASE_URL=https://<store-id>.public.blob.vercel-storage.com

# ─── Sentry (opsiyonel — gözlemlenebilirlik)
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# ─── Upstash (OPSIYONEL — sadece PM2 cluster veya çoklu instance gerekirse)
# Tek-instance topolojide bos bırak; memory rate-limit yeterli (F-0005 deferred).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# ─── Yasal (Mesafeli Sözleşme zorunlu)
BRAND_TAX_OFFICE=<vergi dairesi>
BRAND_TAX_NUMBER=<vergi no>
BRAND_MERSIS_NUMBER=<mersis no>

# ─── Yüksek tutar alarmı
HIGH_VALUE_ORDER_THRESHOLD=10000
LOW_STOCK_THRESHOLD=5
ADMIN_NOTIFY_NEW_SIGNUP=
```

Dosya izinleri:
```bash
chmod 600 ~/master-education/.env.production
```

---

## 4. PM2 ecosystem dosyası

`~/master-education/ecosystem.config.js`:
```js
module.exports = {
  apps: [
    {
      name: "master-education",
      cwd: "/home/mastereducation/master-education",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",            // §0'da port netleşince güncelle
      instances: 1,                      // cluster KAPALI (single instance topology)
      exec_mode: "fork",
      max_memory_restart: "768M",
      env_file: "/home/mastereducation/master-education/.env.production",
      env: {
        NODE_ENV: "production",
      },
      out_file: "/home/mastereducation/.pm2/logs/master-education-out.log",
      error_file: "/home/mastereducation/.pm2/logs/master-education-err.log",
      time: true,
      autorestart: true,
      restart_delay: 5000,
      kill_timeout: 5000,
      wait_ready: false,                 // Next start ready-signal göndermiyor
      listen_timeout: 30000,
    },
  ],
};
```

> **`okultedarigi`'nın PM2 yapılandırmasına dokunma.** Yeni app eklerken sadece kendi blok'u.

---

## 5. nginx server block

`/etc/nginx/sites-available/mastereducation.com.tr`:
```nginx
# Master Education — Next.js (master-education app, port 3001)
# DİKKAT: okultedarigi.com için ayrı bir server block mevcut, dokunma.

# HTTP -> HTTPS yönlendirme (Let's Encrypt sonrası)
server {
    listen 80;
    listen [::]:80;
    server_name mastereducation.com.tr www.mastereducation.com.tr;

    # Let's Encrypt webroot challenge
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name mastereducation.com.tr www.mastereducation.com.tr;

    # SSL (certbot otomatik dolduracak; ilk certbot run sonrası dokunma)
    ssl_certificate     /etc/letsencrypt/live/mastereducation.com.tr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mastereducation.com.tr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Güvenlik başlıkları
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Upload boyut limiti (8MB bayi belge + 5MB ürün resmi + 10MB Excel)
    client_max_body_size 16M;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript application/xml+rss text/xml application/x-javascript;
    gzip_min_length 1024;

    # Statik /public dosyaları (Next.js zaten servis ediyor; opsiyonel direkt nginx servis)
    # (Pas geçilebilir — Next.js'ten servis edilebilir.)

    location / {
        proxy_pass http://127.0.0.1:3001;     # §0'daki port ile uyumla
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_cache_bypass $http_upgrade;

        # Webhook'lar uzun sürebilir
        proxy_read_timeout 60s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
    }

    # Cron endpoint'leri — rate-limit + IP allowlist eklenebilir (opsiyonel)
    # location /api/cron/ {
    #   allow <cron-scheduler-IP>;
    #   deny all;
    #   proxy_pass http://127.0.0.1:3001;
    # }
}
```

Etkinleştir:
```bash
sudo ln -s /etc/nginx/sites-available/mastereducation.com.tr /etc/nginx/sites-enabled/
sudo nginx -t          # syntax kontrol — okultedarigi'nin server block'unu doğrula
sudo systemctl reload nginx
```

---

## 6. Let's Encrypt (certbot)

```bash
# Eğer henüz kurulu değilse
sudo apt install -y certbot python3-certbot-nginx

# Webroot challenge için klasör
sudo mkdir -p /var/www/letsencrypt
sudo chown -R www-data:www-data /var/www/letsencrypt

# Sertifika çek (mastereducation + www)
sudo certbot --nginx -d mastereducation.com.tr -d www.mastereducation.com.tr \
  --email info@mastereducation.com.tr --agree-tos --no-eff-email --redirect

# Otomatik renew (her gün cron'da kontrol)
sudo systemctl list-timers | grep certbot      # zaten varsa hazır
# Yoksa:
# sudo systemctl enable certbot.timer
```

Test renewal:
```bash
sudo certbot renew --dry-run
```

---

## 7. İlk deploy adımları

> `mastereducation` kullanıcısı ile, `~/master-education/` dizininde.

```bash
# 1) Bağımlılıklar (prod-only, deterministic)
npm ci --omit=dev=false

# 2) Prisma client üret + migration uygula
npx prisma generate
npx prisma migrate deploy   # production migrations only

# 3) Üretim build
npm run build

# 4) Seed (sadece İLK deploy'da — production'da idempotent olmasını doğrula)
# DİKKAT: Mevcut DB'de veri varsa atla. Boş DB ise:
# SEED_ADMIN_PASSWORD=<güçlü-parola> npm run seed

# 5) PM2 ile başlat
pm2 start ecosystem.config.js

# 6) PM2 boot persistence
pm2 save
pm2 startup systemd
# (komut çıktısındaki sudo komutunu çalıştır)

# 7) Sanity check
pm2 logs master-education --lines 30
curl -s https://mastereducation.com.tr/api/health | jq
# Beklenen: {"status":"ok","components":{"db":"ok","email":"ok",...}}
```

---

## 8. Restart / Rollback prosedürü

### Routine restart (kod değişikliği sonrası)
```bash
cd ~/master-education
git fetch origin main
git log HEAD..origin/main --oneline    # neler geliyor — gözle kontrol
git pull origin main
npm ci --omit=dev=false
npx prisma migrate deploy              # yeni migration varsa
npm run build
pm2 reload master-education            # zero-downtime reload (fork modunda restart davranır)
sleep 5
curl -fsS https://mastereducation.com.tr/api/health > /dev/null && echo "OK" || echo "FAIL — rollback başlat"
```

### Hot restart (env değişikliği sonrası)
```bash
pm2 restart master-education --update-env
```

### Rollback (deploy başarısız — son çalışan sürüme dön)
```bash
cd ~/master-education
# Bir önceki release tag/SHA'yı checkout et
git log --oneline -5                   # son 5 commit
git checkout <onceki-SHA>
npm ci --omit=dev=false
# Migration GERİ ALINMAZ — manuel inceleme gerekir. Genelde forward-only.
npm run build
pm2 reload master-education
curl -fsS https://mastereducation.com.tr/api/health > /dev/null && echo "rollback OK"
```

### Acil duruş (panik)
```bash
pm2 stop master-education       # okultedarigi etkilenmez
# nginx blok yorumla VEYA 503 maintenance page'ine yönlendir
```

---

## 9. Smoke test (deploy sonrası ilk 10 dakika)

```bash
# 1) Health
curl -fsS https://mastereducation.com.tr/api/health | jq

# 2) Ana sayfa render
curl -fsSI https://mastereducation.com.tr | head -5     # 200 OK + güvenlik headerları görmek istenir

# 3) Mevcut SSL ve HSTS
curl -fsSI https://mastereducation.com.tr | grep -i "strict-transport-security"

# 4) Cron auth (yanlış token reddedilmeli)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://mastereducation.com.tr/api/cron/cleanup-reset-tokens   # → 401

# 5) PM2 metrikleri
pm2 monit                 # CPU/RAM/event-loop lag

# 6) Postgres bağlantı sayısı
sudo -u postgres psql -c "SELECT count(*), state FROM pg_stat_activity WHERE datname='master_education' GROUP BY state;"
```

---

## 10. Bilinen riskler ve kontrol noktaları

| Risk | Kontrol |
|---|---|
| `okultedarigi` kazara restart | PM2 komutlarında **HER ZAMAN** `master-education` adıyla; `pm2 restart all` kullanma. |
| nginx config çakışması | `nginx -t` mutlaka. `okultedarigi.com` server block'u dokunulmamış olmalı. |
| Postgres bağlantı havuzu (paylaşımlı PG) | `max_connections` kontrolü; iki uygulama birlikte ~30 connection'ı geçmemeli. Gerekirse PgBouncer. |
| Disk dolması (5763 ürün görseli + e-fatura PDF'leri) | Vercel Blob'a delege. VPS lokal /uploads kullanılmaz. |
| Webhook IP allowlist | Iyzico/Shipentegra panellerinde callback URL ve allowlist gerekirse |
| .env sızıntısı | `chmod 600`; sudo'ya açma; backup'larda dahil etme |
| Migration rollback yok | Forward-only düşün; risky migration için ayrıca DB backup al |
| Let's Encrypt rate limit | İlk dene `--dry-run`; çok denersen 1 hafta block |

---

## 11. Sonraki adımlar (deploy sonrası — bu doküman dışı)

- Sentry DSN doldur (gözlemlenebilirlik)
- Vercel Blob CDN URL'i ürün görselleri için `NEXT_PUBLIC_BLOB_BASE_URL`'e yaz
- KolayBi prod credential'ları doğrula (`scripts/check-prod-env.ts`)
- Iyzico prod'da bir tane düşük tutarlı sipariş test et (1 TL gerçek POS)
- Cron scheduler ayarla (Vercel Cron olmadığı için: systemd timer veya GitHub Actions schedule + cron-auth header)
- F-1011 (KDV iskonto-sonrası eksik), F-1003 (kupon kullanıcı-limit), F-0707 (AuditLog retention), F-0721 (Blob orphan temizliği) sprint'e al — bunlar deploy bloker değil ama prod'da ilk aydaki risk.

---

**Doküman versiyon:** Tur 3 — 2026-05-18  
**Sahip:** Master Education deploy yetkilisi  
**İlgili dokümanlar:** `docs/RUNBOOK.md` (operasyonel), `docs/SECURITY_AUDIT_FINAL.md` (güvenlik baseline)
