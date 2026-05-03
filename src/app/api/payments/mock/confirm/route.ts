import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentConfirmSchema, flattenZodError } from "@/lib/validations";
import { mockPaymentsEnabled } from "@/lib/env";

/**
 * Mock 3D Secure confirmation.
 *
 * The "correct" OTP is hardcoded to "123456" for the demo. A real integration
 * (Iyzico/PayTR/Craftgate) would verify a signed callback from the PSP and
 * trust their status instead of an OTP we look at.
 *
 * In production this endpoint is disabled unless ENABLE_MOCK_PAYMENTS=true.
 *
 * Concurrency: the PaymentSession is "claimed" with an atomic updateMany
 * guarded by `status = PENDING` before we touch the order or restore stock.
 * If two callbacks arrive for the same session (retry, double-click, attacker),
 * only one wins; the loser gets 409. Without this, the loser could double-pay
 * the order or double-restore stock on the failure path.
 */
const MAGIC_OTP = "123456";
const RACE_ERROR = "PAYMENT_SESSION_RACE";

export async function POST(req: NextRequest) {
  if (!mockPaymentsEnabled()) {
    return NextResponse.json(
      { error: "Mock odeme uretimde kapali." },
      { status: 403 }
    );
  }
  const json = await req.json().catch(() => ({}));
  const parsed = paymentConfirmSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { token, action, otp } = parsed.data;

  const ps = await prisma.paymentSession.findUnique({
    where: { token },
    include: { order: { select: { id: true, orderNumber: true, status: true } } },
  });
  if (!ps) {
    return NextResponse.json(
      { error: "Odeme oturumu bulunamadi." },
      { status: 404 }
    );
  }
  if (ps.status !== "PENDING") {
    return NextResponse.json(
      { error: `Odeme zaten ${ps.status.toLowerCase()} durumunda.` },
      { status: 409 }
    );
  }
  if (ps.expiresAt < new Date()) {
    // Atomic expiry mark so concurrent requests don't each write a row.
    await prisma.paymentSession.updateMany({
      where: { id: ps.id, status: "PENDING" },
      data: { status: "EXPIRED", processedAt: new Date() },
    });
    return NextResponse.json(
      { error: "Odeme oturumu suresi dolmus." },
      { status: 410 }
    );
  }

  if (action === "success") {
    if (otp !== MAGIC_OTP) {
      return NextResponse.json(
        { error: "Gecersiz dogrulama kodu. (Mock: 123456 kullanin.)" },
        { status: 400 }
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.paymentSession.updateMany({
          where: { id: ps.id, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "COMPLETED", processedAt: new Date() },
        });
        if (claimed.count === 0) throw new Error(RACE_ERROR);

        await tx.order.update({
          where: { id: ps.orderId },
          data: {
            paymentStatus: "PAID",
            status: ps.order.status === "PENDING" ? "PROCESSING" : ps.order.status,
          },
        });
        await tx.auditLog.create({
          data: {
            action: "ORDER_AUTO_APPROVE",
            entityType: "Order",
            entityId: ps.orderId,
            metadata: { reason: "credit_card_paid", orderNumber: ps.order.orderNumber },
          },
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === RACE_ERROR) {
        return NextResponse.json(
          { error: "Bu odeme oturumu baska bir istek tarafindan islendi." },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({
      status: "success",
      orderNumber: ps.order.orderNumber,
      orderId: ps.orderId,
    });
  }

  // action === "failure": cancel the order and restore stock.
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentSession.updateMany({
        where: { id: ps.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "FAILED", processedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error(RACE_ERROR);

      const items = await tx.orderItem.findMany({
        where: { orderId: ps.orderId },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: { increment: item.quantity } as unknown as Prisma.IntFieldUpdateOperationsInput,
          },
        });
      }
      await tx.order.update({
        where: { id: ps.orderId },
        data: {
          status: "CANCELLED",
          paymentStatus: "FAILED",
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === RACE_ERROR) {
      return NextResponse.json(
        { error: "Bu odeme oturumu baska bir istek tarafindan islendi." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({
    status: "failure",
    orderNumber: ps.order.orderNumber,
    orderId: ps.orderId,
  });
}
