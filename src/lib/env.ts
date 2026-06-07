import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL gerekli.")
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "DATABASE_URL postgres(ql):// ile baslamali.",
    }),
  // NextAuth signing key. 32 karakter (256-bit) zorunluk; brute-force ve
  // birthday attacks'a karsi yeterli entropy. `npx tsx scripts/generate-secret.ts`
  // ile uretilen 64-char hex bunu fazlasiyla karsilar.
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET en az 32 karakter olmali (npx tsx scripts/generate-secret.ts)"),
  // Prod'da unutulursa email URL'leri localhost'a / placeholder default'a dusup
  // tüm dogrulama/sifre-reset linklerini kirar. Production icin zorunlu.
  NEXTAUTH_URL: z.string().url().optional(),
  // SMTP — hepsi optional; tanimsizsa dryrun moduna geciyor (lib/email.ts)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => !v || /^\d+$/.test(v), "SMTP_PORT numara olmali."),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  // Muhasebe/fatura bildirimleri bu adrese gider (e-fatura kesimi, retry
  // tukenmesi). Tanimsizsa default kurumsal muhasebe kutusu kullanilir.
  ACCOUNTING_EMAIL: z
    .string()
    .email()
    .optional()
    .default("muhasebe@mastereducation.com.tr"),
  // Admin'e "yuksek tutar sipariş" alarmi tetikleyen esik. Asilinca yeni
  // sipariş bildirim mailinde kirmizi banner çıkar (E21 — fraud kontrolu icin).
  // Default 10000 TL. 0 verirsen tüm siparişleri yuksek-tutar sayar (kapatma
  // amacli kullanma).
  HIGH_VALUE_ORDER_THRESHOLD: z
    .string()
    .optional()
    .default("10000")
    .transform((v) => Number(v)),
  // Yeni kullanıcı kayıtlari icin admin'e bilgilendirme maili (E16 — opt-in).
  // Default off — kayıt çok olan sitelerde gurultu olmasin.
  ADMIN_NOTIFY_NEW_SIGNUP: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Dusuk stok daily digest (E17). Bu eşik alti yayinda ürünler tek mail
  // halinde admin'e raporlanir. Default 5 — saglikli envanter icin azaltin.
  LOW_STOCK_THRESHOLD: z
    .string()
    .optional()
    .default("5")
    .transform((v) => Number(v)),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Mock ödeme (3D Secure + OTP=123456). Prod'da otomatik kapali. Gercek
  // gateway entegre edilene kadar staging'de acik birakmak icin true yap.
  ENABLE_MOCK_PAYMENTS: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  // Cron endpoint guard. Vercel Cron icin "CRON_SECRET" header'da gonderilir;
  // tanimsizsa endpoint'ler 503 doner (kazara public erisim engellenmis olur).
  CRON_SECRET: z.string().min(16).optional(),
  // ─── KolayBi e-fatura entegrasyonu ──────────────────────────────
  // Hepsi optional; tanimsizsa DRYRUN modu (fatura DB'ye kaydedilir,
  // kolaybi'ye istek atilmaz). Prod'da hepsi dolu olmalı. Sandbox URL
  // varsayilan olarak verili; prod'da `https://ofis-api.kolaybi.com`
  KOLAYBI_BASE_URL: z
    .string()
    .url()
    .optional()
    .default("https://ofis-sandbox-api.kolaybi.com"),
  KOLAYBI_API_KEY: z.string().optional(),
  KOLAYBI_CHANNEL: z.string().optional(),
  // Fatura serisi/ön eki — normalde panelde tanımlı varsayılan ön ek kullanılır
  // ve bu boş bırakılır. Yalnız belirli bir seriyi zorlamak gerekirse doldur;
  // dolu ise invoice payload'a `serial_no` olarak geçer.
  KOLAYBI_INVOICE_PREFIX: z.string().optional(),
  // ─── Rate-limit / proxy güvenliği ───────────────────────────────
  // Distributed rate-limit backend (lib/rate-limit.ts). İkisi de doluysa
  // Upstash'a geçer; aksi halde in-memory (serverless'ta worker başına ayrı
  // sayaç → login/register limiti pratik bypass). Prod'da zorunlu (guard altta).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Reverse-proxy (Vercel/Nginx) arkasında "true" → istemci IP'si x-real-ip /
  // XFF son hop'tan alınır (lib/get-client-ip.ts). Aksi halde tüm istekler
  // "direct" bucket'ına düşer ve per-IP rate-limit anlamsızlaşır. Prod'da true.
  TRUSTED_PROXY: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  // Prod rate-limit guard'ını bilinçli olarak devre dışı bırakmak için kaçış
  // kapısı. true ise eksik Upstash/TRUSTED_PROXY boot'u durdurmaz, sadece
  // gürültülü log basar. Geçici kullan — kalıcı bırakma.
  ALLOW_INSECURE_RATELIMIT: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

function parseEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    // Fail loudly so misconfiguration is obvious on boot.
    throw new Error(
      `[env] Gecersiz ortam degiskenleri:\n  ${details}`
    );
  }
  // Production'da NEXTAUTH_URL zorunlu — tanimsizsa email/oauth callback
  // URL'leri localhost veya placeholder'a dusup dogrulama akisini kirar.
  if (result.data.NODE_ENV === "production" && !result.data.NEXTAUTH_URL) {
    throw new Error(
      "[env] NEXTAUTH_URL production'da zorunludur. Prod domain (https://...) ile ayarlayin."
    );
  }
  // Production rate-limit güvenlik guard'ı. Upstash yoksa in-memory limiter
  // serverless'ta worker başına çoğalır (login/register ~10× bypass); TRUSTED_PROXY
  // yoksa per-IP rate-limit "direct" bucket'ına çökerek anlamsızlaşır. İkisi de
  // kritik olduğundan prod'da boot'u durduruyoruz — ALLOW_INSECURE_RATELIMIT=true
  // ile bilinçli olarak atlanabilir (geçici, gürültülü log basar).
  if (result.data.NODE_ENV === "production") {
    const hasUpstash =
      !!result.data.UPSTASH_REDIS_REST_URL && !!result.data.UPSTASH_REDIS_REST_TOKEN;
    const problems: string[] = [];
    if (!hasUpstash) {
      problems.push(
        "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN tanımsız — rate-limit in-memory; serverless/çok-instance ortamda login/register limiti bypass edilebilir."
      );
    }
    if (!result.data.TRUSTED_PROXY) {
      problems.push(
        "TRUSTED_PROXY!=true — istemci IP tespiti kapalı; tüm trafik tek 'direct' bucket'ına düşüp per-IP rate-limit'i etkisizleştirir (reverse-proxy arkasında true yapın)."
      );
    }
    if (problems.length > 0) {
      const msg = `[env] Production rate-limit güvenlik guard'ı:\n  ${problems.join("\n  ")}`;
      if (result.data.ALLOW_INSECURE_RATELIMIT) {
        console.error(`${msg}\n  (ALLOW_INSECURE_RATELIMIT=true ile atlandı — geçici olmalı.)`);
      } else {
        throw new Error(
          `${msg}\n  Düzeltin ya da bilinçliyseniz ALLOW_INSECURE_RATELIMIT=true ile geçici atlayın.`
        );
      }
    }
  }
  return result.data;
}

export const env = parseEnv();

export type Env = typeof env;

/**
 * Mock 3D Secure payment is auto-disabled in production unless
 * ENABLE_MOCK_PAYMENTS=true is set explicitly (e.g. staging). In dev/test it's
 * always on so local flows keep working without an env var.
 */
export function isMockPaymentsAllowed(
  nodeEnv: string,
  flag: boolean,
): boolean {
  if (nodeEnv !== "production") return true;
  return flag === true;
}

export function mockPaymentsEnabled(): boolean {
  return isMockPaymentsAllowed(env.NODE_ENV, env.ENABLE_MOCK_PAYMENTS);
}
