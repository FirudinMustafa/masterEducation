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
  // tum dogrulama/sifre-reset linklerini kirar. Production icin zorunlu.
  NEXTAUTH_URL: z.string().url().optional(),
  // SMTP — hepsi optional; tanimsizsa dryrun moduna geciyor (lib/email.ts)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "SMTP_PORT numara olmali."),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Mock odeme (3D Secure + OTP=123456). Prod'da otomatik kapali. Gercek
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
  // Mock mode: gerçek HTTP atmaz, deterministik synthetic ID'ler döndürür.
  // Test ortamında credentials gelmeden senaryo testi için.
  // Prod'da false bırak.
  KOLAYBI_MOCK: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
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
