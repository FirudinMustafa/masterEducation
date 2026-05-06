import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { iyzicoAdapter } from "@/lib/adapters/iyzico";
import { logAudit } from "@/lib/audit";

/**
 * Iyzico webhook — async event'ler için (refund, chargeback, paymentStatus
 * değişimi). HMAC-SHA256 signature header (`x-iyzi-signature`).
 *
 * Idempotency: aynı (paymentId, eventType) tekrar gelirse PaymentSession +
 * Order zaten doğru state'te olur — `updateMany WHERE status != ...` ile.
 */

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-iyzi-signature") ?? "";

  if (!iyzicoAdapter.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const referenceCode = String(payload.iyziReferenceCode ?? "");
  const paymentId = String(payload.paymentId ?? "");
  const paymentStatus = String(payload.paymentStatus ?? "");
  const eventType = String(payload.iyziEventType ?? "");

  if (!referenceCode) {
    return NextResponse.json({ error: "missing_reference" }, { status: 400 });
  }

  const session = await prisma.paymentSession.findUnique({
    where: { id: referenceCode },
  });
  if (!session) {
    // Bilinmeyen reference — başarılı 200 dön (Iyzico retry yapmasın), audit'a yaz.
    logAudit({
      actorId: null,
      action: "ORDER_STATUS_CHANGE",
      entityType: "order",
      entityId: "unknown",
      metadata: { provider: "iyzico", stage: "webhook", referenceCode, paymentId, eventType },
    });
    return NextResponse.json({ ok: true });
  }

  if (eventType === "REFUND" || paymentStatus === "REFUNDED") {
    // PaymentSessionStatus enum'da REFUNDED yok — yalnızca Order.paymentStatus'a
    // (PaymentStatus.REFUNDED) yansıt; PaymentSession COMPLETED kalır.
    await prisma.order.update({
      where: { id: session.orderId },
      data: { paymentStatus: "REFUNDED" },
    });
  } else if (paymentStatus === "FAILURE" || paymentStatus === "CANCELLED") {
    await prisma.paymentSession.updateMany({
      where: { id: session.id, status: "PENDING" },
      data: { status: "FAILED", processedAt: new Date() },
    });
  }

  logAudit({
    actorId: null,
    action: "ORDER_STATUS_CHANGE",
    entityType: "order",
    entityId: session.orderId,
    metadata: { provider: "iyzico", stage: "webhook", paymentId, eventType, paymentStatus },
  });

  return NextResponse.json({ ok: true });
}
