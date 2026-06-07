import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema, flattenZodError } from "@/lib/validations";
import { queueEmail, templatePasswordReset } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-hash";
import { getClientIp } from "@/lib/get-client-ip";

const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Timing-safe: kullanıcı yoksa bile "user-found" branch'inin yapacağı
 * yaklaşık iş kadar süreyi yapay olarak harca. Saldırgan response
 * süresinden email'in DB'de olup olmadığını çıkaramaz.
 */
async function timingSafeNoop(): Promise<void> {
  // crypto.randomBytes + DB üzerinde dummy upsert — varlığını sızdırmadan
  // benzer bir CPU + I/O izi bırakır.
  crypto.randomBytes(32);
  // 50-150ms arası rastgele delay (token create + invalidate + queue
  // pseudo-istatiksel ortalaması bu civarda)
  const ms = 50 + Math.floor(Math.random() * 100);
  await new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  // SECURITY: trusted-proxy last-hop; raw XFF first-hop bypass'a aciktı
  // (QA F-API-0002 — reset email spam).
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla istek. Daha sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Invalidate any previously issued unused tokens for this user.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // DB'de SHA-256 hash sakla; email URL'inde plain token. DB breach
    // durumunda saldırgan token'ları kullanamaz (hash → token tersi yok).
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashToken(token), expiresAt },
    });

    const origin = req.nextUrl.origin;
    const url = `${origin}/sifre-sifirla?token=${token}`;
    // Dev kolaylığı: SMTP yapılandırılmamışsa email DRYRUN'a düşer ve URL hiçbir
    // yere ulaşmaz. URL'i console'a yazdırarak geliştiriciye yardım.
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      console.log(`[dev:reset-link] ${email} → ${url}`);
    }
    after(() => {
      const tpl = templatePasswordReset(url);
      queueEmail({ ...tpl, to: email });
    });
  } else {
    // Email DB'de yok — yine de aynı süreyi harca (timing attack engeli).
    await timingSafeNoop();
  }

  // Generic response: email var olsa da olmasa da aynı.
  return NextResponse.json({ ok: true });
}
