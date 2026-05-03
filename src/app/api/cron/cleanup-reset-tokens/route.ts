import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Eski sifre sifirlama tokenlerini temizler:
 *  - expiresAt < NOW
 *  - veya usedAt 7 gun once'sinden eski
 * Token'lar tek-kullanimlik oldugu icin tutmaya gerek yok.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { usedAt: { lt: sevenDaysAgo } },
      ],
    },
  });

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    at: now.toISOString(),
  });
}
