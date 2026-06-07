import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { hashToken } from "@/lib/token-hash";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const schema = z.object({
  token: z.string().min(10),
});

export async function POST(req: NextRequest) {
  // F-0020: token brute-force karsisi IP basina saatte 10 cagri yeterli.
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali, QA 2026-05-18)
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`verify-email:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { token } = parsed.data;
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Dogrulama baglantisi gecersiz veya suresi dolmus." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  logAudit({
    actorId: record.userId,
    action: "EMAIL_VERIFY_SUCCESS",
    entityType: "user",
    entityId: record.userId,
  });

  return NextResponse.json({ ok: true });
}
