# Master Education

Master Education e-ticaret ve bayilik platformu. ELT, DaF ve MEB kitaplari icin bireysel + toptan satis, bayilik yonetimi, iskonto motoru, siparis ve muhasebe modullerini icerir.

## Teknoloji

- **Next.js 16** (App Router, Turbopack)
- **React 19** Server Components
- **Prisma 7** + **PostgreSQL** (via `@prisma/adapter-pg`)
- **NextAuth 5** (Credentials, JWT)
- **Tailwind CSS v4**
- **Zustand** (sepet state)
- **Zod** (form/API dogrulama)
- **nodemailer** (SMTP, dryrun fallback)
- **exceljs** (iskonto template/import/export)

## Kurulum

```bash
npm install
```

### Ortam degiskenleri

`.env` dosyasi olusturun:

```env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/master_education"
NEXTAUTH_SECRET="uzun-rastgele-string"
NEXTAUTH_URL="http://localhost:3000"

# Email (opsiyonel — bos birakilirsa dryrun moduna gecer)
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Master Education <no-reply@mastereducation.com.tr>"
```

### Veritabani

```bash
# Migrationlari uygula
npx prisma migrate deploy

# Prisma client generate
npx prisma generate
```

### Seed

Seed, urun CSV'lerinden yayinevi/kategori/urun/gorsel kayitlarini olusturur ve bir admin kullanicisi ekler.

```bash
npm run seed
```

**CSV konumlari:** seed script onceligi su sirayla arar:
1. Proje kok dizininin bir ustu: `../Prdocut.csv`, `../ProductMapping.csv`
2. Proje icinde: `data/Prdocut.csv`, `data/ProductMapping.csv`

Eksik gorsel raporu `docs/MISSING_IMAGES.md` olarak yazilir.

### Varsayilan admin

Seed sonrasi olusan admin:

- **Email:** `admin@mastereducation.com.tr`
- **Sifre:** `admin123`

> Production'a deploy etmeden once mutlaka bu sifreyi degistirin.

### Dev server

```bash
npm run dev
```

Uygulama [http://localhost:3000](http://localhost:3000) adresinde calisir.

## Ana Modüller

### Rol Tabanli Erisim

- `CUSTOMER` — bireysel musteri
- `DEALER` — bayi (statu: `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`)
- `ADMIN` — tum panel erisimi

### Iskonto Motoru (`src/lib/pricing.ts`)

Bayi fiyatlandirmasi oncelik sirasi:

1. `PRODUCT` — urun bazli ozel iskonto
2. `DISCOUNT_GROUP` — indirim grubu bazli
3. `PUBLISHER` — yayinevi bazli
4. `GLOBAL` — bayiye ozel tum urunler

### Siparis Akisi

`PENDING` → `APPROVED` → `PROCESSING` → `SHIPPED` → `DELIVERED` / `CANCELLED`

Stok azaltma transaction icinde race-safe sekilde yapilir (`updateMany` + `gte` stok kontrolu). Iptal durumunda stok geri yuklenir, acik hesapli bayi siparisi iptalinde bayi bakiyesi geri dusulur.

### Odeme

- `CREDIT_CARD` — odeme islemi mock; statu `PENDING` baslar, `DELIVERED` durumunda otomatik `PAID` olur.
- `OPEN_ACCOUNT` — yalnizca `APPROVED` bayiler icin. Siparis toplami + mevcut bakiye `creditLimit` degerini asarsa reddedilir.

### Muhasebe

`/admin/muhasebe` sayfasindan tarih araligina gore siparis ve kalem bazli CSV export alinir. Turkce Excel icin noktali virgul delimiter + UTF-8 BOM kullanilir.

### Email Servisi

`src/lib/email.ts` tum email gonderimlerini `EmailLog` tablosuna yazar. SMTP env tanimli degilse email icerigi `DRYRUN` statusu ile loglanir ve console'a basilir.

Sablonlar:
- Bayi basvurusu alindi
- Bayi onaylandi / reddedildi
- Siparis olusturuldu
- Siparis statu degisikligi
- Sifre sifirlama

## Onemli Klasorler

```
src/
├── app/
│   ├── (storefront)/     # Musteri facing sayfalar
│   ├── admin/            # Admin paneli
│   ├── bayi/             # Bayi paneli
│   └── api/              # API route'lari
├── components/
│   ├── admin/            # Admin UI
│   ├── products/         # Urun kart, grid, filtre
│   ├── layout/           # Header, Footer
│   └── ui/               # Button, Input, Badge, vs.
├── lib/
│   ├── pricing.ts        # Iskonto motoru
│   ├── session-pricing.ts
│   ├── email.ts
│   ├── prisma.ts
│   ├── auth.ts
│   ├── validations.ts    # Zod semalari
│   └── adapters/         # Muhasebe CSV, kargo mock
└── stores/
    └── cart-store.ts     # Zustand sepet state

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

docs/
├── PLAN.md
├── PROGRESS.md
└── MISSING_IMAGES.md     # seed sonrasi olusur
```

## Public API

- `GET /api/products/[id]` — tek urun detayi (bayi oturumu varsa iskontolu fiyat dahil; `id` alani slug de olabilir)

## Komutlar

| Komut | Aciklama |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run seed` | Veritabanini CSV'den doldur + admin olustur |

## Notlar

- Bu proje Next.js'in yeni surumunde calisir ve `AGENTS.md` kurallarini takip eder. Yeni kod yazmadan once `node_modules/next/dist/docs/` altindaki ilgili rehberi okuyun.
- Bayi fiyatlari yalnizca `APPROVED` statusundeki bayilere gosterilir; oturum yoksa veya statu farkli ise listeleme fiyati gecerlidir.
- `public/images/products/` altinda urun gorselleri beklenir. `seed.ts` eksik gorselleri `docs/MISSING_IMAGES.md` raporuna yazar.
