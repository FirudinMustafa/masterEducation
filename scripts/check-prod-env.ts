/**
 * Production env validator — deploy oncesi calistirilir.
 *
 *   npx tsx scripts/check-prod-env.ts
 *
 * Asagidaki kurallari kontrol eder:
 *   - Zorunlu env variable'lar set mi?
 *   - NEXTAUTH_SECRET asgari uzunluk + entropy
 *   - DATABASE_URL https/postgresql formatinda mi?
 *   - NEXTAUTH_URL bos mu? localhost mu?
 *   - SMTP credentials (Resend) tam mi?
 *   - KOLAYBI_MOCK production'da false mi?
 *   - ENABLE_MOCK_PAYMENTS production'da false mi?
 *   - CRON_SECRET set mi (cron endpoint'leri korur)?
 *
 * Hata durumunda exit code 1 doner — CI/CD pipeline'a takilir.
 */
import { config } from "dotenv";
config();

type Issue = { level: "error" | "warning"; key: string; reason: string };
const issues: Issue[] = [];

function err(key: string, reason: string) {
  issues.push({ level: "error", key, reason });
}
function warn(key: string, reason: string) {
  issues.push({ level: "warning", key, reason });
}
function require(key: string, reason: string) {
  if (!process.env[key] || !process.env[key]!.trim()) err(key, reason);
}

console.log("\n🔍 Production env check\n");

// ─── Zorunlu ───────────────────────────────────────
require("DATABASE_URL", "Postgres baglantisi gerekli.");
require("NEXTAUTH_SECRET", "NextAuth cookie/jwt imzalama icin gerekli.");
require("NEXTAUTH_URL", "Mutlak URL gerekli (canli domain).");
require("CRON_SECRET", "Vercel Cron / external scheduler imzalamasi icin gerekli.");
require("SMTP_HOST", "Email gonderimi icin SMTP host gerekli (DRYRUN'a dusurmek riskli).");
require("SMTP_USER", "SMTP kullanicisi gerekli.");
require("SMTP_PASS", "SMTP sifresi gerekli.");
require("SMTP_FROM", "Email From adresi gerekli.");
require("ADMIN_EMAIL", "Bayi basvuru ve sistem bildirimleri icin gerekli.");

// ─── NEXTAUTH_SECRET kalite ───────────────────────
const secret = process.env.NEXTAUTH_SECRET ?? "";
if (secret) {
  if (secret.length < 32) {
    err("NEXTAUTH_SECRET", `Cok kisa (${secret.length} char). En az 32, ideali 64+.`);
  }
  if (/^(secret|password|test|dev|change|admin)/i.test(secret)) {
    err("NEXTAUTH_SECRET", "Tahmin edilebilir kelime ile basliyor.");
  }
  // Basit entropy kontrolu — ayni karakter cok tekrarlamasin
  const uniq = new Set(secret).size;
  if (uniq < 16) {
    warn("NEXTAUTH_SECRET", `Dusuk entropy (${uniq} farkli karakter).`);
  }
}

// ─── NEXTAUTH_URL ─────────────────────────────────
const authUrl = process.env.NEXTAUTH_URL ?? "";
if (authUrl) {
  if (!authUrl.startsWith("https://")) {
    err("NEXTAUTH_URL", "Production'da HTTPS olmali (cookie Secure flag'i icin).");
  }
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(authUrl)) {
    err("NEXTAUTH_URL", "localhost/IP — canli domaine guncelleyin.");
  }
}

// ─── DATABASE_URL ─────────────────────────────────
const dbUrl = process.env.DATABASE_URL ?? "";
if (dbUrl) {
  if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    err("DATABASE_URL", "postgresql:// formatinda olmali.");
  }
  if (/localhost|127\.0\.0\.1/.test(dbUrl)) {
    warn("DATABASE_URL", "localhost — production icin bulut DB (Neon/Supabase/RDS) onerilir.");
  }
  if (/:postgres@|:password@|:admin@/.test(dbUrl)) {
    err("DATABASE_URL", "Default/zayif sifre tespit edildi.");
  }
}

// ─── CRON_SECRET kalite ───────────────────────────
const cronSec = process.env.CRON_SECRET ?? "";
if (cronSec && cronSec.length < 32) {
  err("CRON_SECRET", `Cok kisa (${cronSec.length} char). En az 32 karakter onerilir.`);
}

// ─── Mock flag'ler kapali olmali ──────────────────
if (process.env.ENABLE_MOCK_PAYMENTS === "true") {
  err("ENABLE_MOCK_PAYMENTS", "Production'da kapali olmali (mock 3D Secure aktif).");
}
if (process.env.KOLAYBI_MOCK === "true" || process.env.KOLAYBI_MOCK === "1") {
  err("KOLAYBI_MOCK", "Production'da kapali olmali (synthetic fatura ID'leri).");
}

// ─── KolayBi credentials (varsa hepsi tam olmali) ─
const kolaybiKey = process.env.KOLAYBI_API_KEY;
const kolaybiCh = process.env.KOLAYBI_CHANNEL;
if ((kolaybiKey && !kolaybiCh) || (!kolaybiKey && kolaybiCh)) {
  err(
    "KOLAYBI_*",
    "API_KEY ve CHANNEL ya birlikte set ya da ikisi de bos olmali (DRYRUN)."
  );
}

// ─── ADMIN default sifre uyarisi ──────────────────
if (
  process.env.ADMIN_EMAIL?.toLowerCase() === "admin@mastereducation.com.tr"
) {
  warn(
    "ADMIN_EMAIL",
    "Default seed admin email'i. Lutfen seed sonrasi ayri bir admin user olusturun ve admin123 sifresini degistirin."
  );
}

// ─── Cikis ────────────────────────────────────────
if (issues.length === 0) {
  console.log("✅ Tum env kontrolleri gecti.\n");
  process.exit(0);
}

const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

for (const i of errors) {
  console.log(`❌ ${i.key}: ${i.reason}`);
}
for (const i of warnings) {
  console.log(`⚠️  ${i.key}: ${i.reason}`);
}

console.log(
  `\n${errors.length} hata, ${warnings.length} uyari.\n`
);

if (errors.length > 0) process.exit(1);
process.exit(0);
