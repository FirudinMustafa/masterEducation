import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runCronJob } from "@/lib/cron-runner";

export const dynamic = "force-dynamic";

/**
 * Eski şifre sifirlama tokenlerini temizler:
 *  - expiresAt < NOW
 *  - veya usedAt 7 gün once'sinden eski
 * Token'lar tek-kullanimlik oldugu icin tutmaya gerek yok.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  return runCronJob("cleanup-reset-tokens", async () => {
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
  });
}
