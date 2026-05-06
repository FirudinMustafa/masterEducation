import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { iyzicoAdapter } from "@/lib/adapters/iyzico";
import { logAudit } from "@/lib/audit";

/**
 * Iyzico 3DS callback — kullanıcı 3DS popup'ında doğrulamayı bitirdiğinde
 * Iyzico bu URL'e POST atar. Form-encoded body bekler.
 *
 * Concurrency: aynı PaymentSession iki callback alabilir (kullanıcı F5'lerse,
 * Iyzico retry yaparsa). `updateMany WHERE status=PENDING AND expiresAt>now()`
 * atomic claim — kazanan order'ı PAID'e alır, kaybeden 409 görür ve 200 döner
 * (Iyzico retry'ı durdurmak için).
 *
 * Idempotency: Iyzico paymentId aynı session'a geliyorsa double-claim olmaz.
 */

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.redirect(new URL("/odeme/iptal", req.url));

  const conversationId = String(formData.get("conversationId") ?? "");
  const paymentId = String(formData.get("paymentId") ?? "");
  const status = String(formData.get("status") ?? "") as
    | "success"
    | "failure"
    | "callback_thr";
  const signature = String(formData.get("signature") ?? "");

  if (!conversationId || !paymentId) {
    return NextResponse.redirect(new URL("/odeme/iptal", req.url));
  }

  const isValid = iyzicoAdapter.verifyCallback({
    conversationId,
    paymentId,
    status,
    signature,
  });
  if (!isValid) {
    console.error("[iyzico:callback] signature mismatch", { conversationId });
    return NextResponse.redirect(new URL("/odeme/iptal?reason=signature", req.url));
  }

  const paymentSession = await prisma.paymentSession.findUnique({
    where: { id: conversationId },
    include: { order: true },
  });
  if (!paymentSession) {
    return NextResponse.redirect(new URL("/odeme/iptal?reason=session", req.url));
  }

  // Atomic claim — race-safe.
  if (status === "success") {
    const claim = await prisma.paymentSession.updateMany({
      where: { id: paymentSession.id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
    if (claim.count === 0) {
      return NextResponse.redirect(new URL("/odeme/iptal?reason=race", req.url));
    }
    await prisma.order.update({
      where: { id: paymentSession.orderId },
      data: { paymentStatus: "PAID", status: "APPROVED" },
    });
    logAudit({
      actorId: paymentSession.order.userId,
      action: "ORDER_STATUS_CHANGE",
      entityType: "order",
      entityId: paymentSession.orderId,
      metadata: { provider: "iyzico", paymentId, status: "PAID" },
    });
    await prisma.orderEvent.create({
      data: {
        orderId: paymentSession.orderId,
        type: "APPROVED",
        note: `Iyzico 3DS başarılı (paymentId=${paymentId})`,
      },
    });
    return NextResponse.redirect(
      new URL(`/odeme/basarili?orderId=${paymentSession.orderId}`, req.url)
    );
  }

  // failure / callback_thr
  await prisma.paymentSession.updateMany({
    where: { id: paymentSession.id, status: "PENDING" },
    data: { status: "FAILED", processedAt: new Date() },
  });
  logAudit({
    actorId: paymentSession.order.userId,
    action: "ORDER_STATUS_CHANGE",
    entityType: "order",
    entityId: paymentSession.orderId,
    metadata: { provider: "iyzico", paymentId, status, stage: "callback" },
  });
  return NextResponse.redirect(new URL("/odeme/iptal", req.url));
}
