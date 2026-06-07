import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { queueEmail, templateEmailVerification } from "@/lib/email";
import { env } from "@/lib/env";
import { hashToken } from "@/lib/token-hash";

// 24 saat → 1 saat: çalınan/loglanan token'ın saldırı penceresi azaltılır.
const TTL_MS = 60 * 60 * 1000;

/**
 * Kullanıcıya yeni bir email dogrulama token'i yayinlar, eski kullanilmamis
 * tokenlari invalidate eder ve email queue'ya ekler. Dogrulama linki
 * NEXTAUTH_URL / olmazsa localhost:3000 base alinir.
 */
export async function issueEmailVerificationToken(
  userId: string,
  name: string,
  email: string,
): Promise<{ token: string; url: string }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);
  // Atomik: eski tokenlari invalidate + yeni token create tek transaction'da.
  // Iki paralel cagri olursa race window'da iki gecerli token oluşmaz.
  // DB'de SHA-256 hash; email URL'inde plain. DB breach durumunda saldırgan
  // hash'leri tersine çeviremez.
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: { userId, token: hashToken(token), expiresAt },
    }),
  ]);

  const base = env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${base}/email-dogrula?token=${token}`;

  // Dev kolaylığı: SMTP yapılandırılmamışsa veya Resend sandbox engellerse
  // mail kullanıcıya ulaşmaz. Linki konsola da yaz — admin/geliştirici görür.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev:verify-link] ${email} → ${url}`);
  }

  const tpl = templateEmailVerification(name, url);
  queueEmail({ ...tpl, to: email });

  return { token, url };
}
