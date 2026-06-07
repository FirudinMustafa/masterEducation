import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema, flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/token-hash";
import { getClientIp } from "@/lib/get-client-ip";

export async function POST(req: NextRequest) {
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali, QA 2026-05-18)
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`reset:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla istek. Daha sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;
  // DB'de hash saklanir; gelen plain token'i hash'le ve karşılaştır.
  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Baglanti gecersiz veya suresi dolmus." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
