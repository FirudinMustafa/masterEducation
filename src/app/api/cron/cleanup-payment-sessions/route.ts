import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Suresi gecmis PENDING odeme oturumlarini EXPIRED'e cevirir.
 * PaymentSession.expiresAt < NOW olan kayitlari isaretler.
 *
 * NOT: Stok geri yukleme islemini yapmiyoruz — `payments/mock/confirm`
 * `failure` pathi siparis CANCELLED'a alindiginda zaten stok dondurur.
 * Burada sadece "asili kalmis" oturumlari isaretliyoruz ki UI'da expired
 * gorulsun ve raporlama dogru olsun.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

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
}
