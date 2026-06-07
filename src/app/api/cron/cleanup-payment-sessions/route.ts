import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runCronJob } from "@/lib/cron-runner";

export const dynamic = "force-dynamic";

/**
 * Suresi gecmis PENDING ödeme oturumlarini EXPIRED'e çevirir.
 * PaymentSession.expiresAt < NOW olan kayıtlari isaretler.
 *
 * NOT: Stok geri yükleme islemini yapmiyoruz — `payments/mock/confirm`
 * `failure` pathi sipariş CANCELLED'a alindiginda zaten stok dondurur.
 * Burada sadece "asili kalmis" oturumlari isaretliyoruz ki UI'da expired
 * gorulsun ve raporlama dogru olsun.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  return runCronJob("cleanup-payment-sessions", async () => {
    const now = new Date();
    const result = await prisma.paymentSession.updateMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      data: { status: "EXPIRED" },
    });

    return NextResponse.json({
      ok: true,
      marked: result.count,
      at: now.toISOString(),
    });
  });
}
