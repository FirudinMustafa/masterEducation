import { NextRequest, NextResponse, after } from "next/server";
import type { CargoCarrier, OrderEventType, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { orderStatusUpdateSchema, flattenZodError } from "@/lib/validations";
import {
  queueEmail,
  templateOrderStatusChanged,
  templateOrderCancelled,
} from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { writeLedgerEntry } from "@/lib/ledger";
import { shippingAdapter } from "@/lib/adapters/shipping";
import { ensureInvoiceForOrder, sendPendingInvoice } from "@/lib/invoice-service";

const STATUS_TO_EVENT: Record<OrderStatus, OrderEventType> = {
  PENDING: "CREATED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

/**
 * Order status state machine — Faz 19 Decision 1A: ardışık geçiş whitelist.
 * PENDING→APPROVED→PROCESSING→SHIPPED→DELIVERED, her aşamadan CANCELLED.
 * Atlamalı geçiş (PENDING→DELIVERED, APPROVED→SHIPPED vb.) reddedilir.
 * CANCELLED ve DELIVERED final state'leridir. Aynı state'e PATCH (sadece
 * tracking/note güncelleme) izinlidir — `statusChanged` guard'ı ile kontrol.
 * Bu kural bulk-status route ile birebir aynı.
 */
const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = orderStatusUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      total: true,
      userId: true,
      shippingName: true,
      shippingCity: true,
      shippingAddress: true,
      shippingPhone: true,
      trackingNumber: true,
      trackingCarrier: true,
      trackingCarrierName: true,
      user: { select: { email: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Siparis bulunamadi." }, { status: 404 });
  }

  const {
    status,
    trackingNumber,
    trackingCarrier,
    trackingCarrierName,
    estimatedDeliveryAt,
    adminNote,
  } = parsed.data;
  const isCancellingNow = status === "CANCELLED" && order.status !== "CANCELLED";
  const wasCancelled = order.status === "CANCELLED";
  const isShippingNow =
    status === "SHIPPED" && order.status !== "SHIPPED";
  const isDeliveringNow =
    status === "DELIVERED" && order.status !== "DELIVERED";
  const statusChanged = status !== order.status;

  if (wasCancelled && status !== "CANCELLED") {
    return NextResponse.json(
      {
        error:
          "Iptal edilmis bir siparis tekrar aktif edilemez. Yeni bir siparis olusturun.",
      },
      { status: 400 }
    );
  }

  // State machine: yalnız izin verilen sonraki state'lere geçiş kabul.
  // Aynı state'e PATCH (sadece tracking/note güncelleme) izinli.
  if (statusChanged && !ALLOWED_NEXT[order.status].includes(status)) {
    return NextResponse.json(
      {
        error: `${order.status} durumundan ${status} durumuna gecis yapilamaz. Izin verilen sonraki durumlar: ${ALLOWED_NEXT[order.status].join(", ") || "—"}`,
      },
      { status: 400 }
    );
  }

  // Auto-generate tracking label on SHIPPED transition if admin didn't provide one.
  // Bu, ileride gercek kargo API entegrasyonu (Shipentegra) icin dokunus
  // noktasi. Simdi mock olsa da, surec yayina girdiginde buraya baglanacak.
  let autoTracking: string | null = null;
  let autoCarrier: CargoCarrier | null = null;
  if (isShippingNow && !trackingNumber && !order.trackingNumber) {
    try {
      const label = await shippingAdapter.createLabel({
        orderNumber: order.orderNumber,
        recipientName: order.shippingName,
        phone: order.shippingPhone,
        city: order.shippingCity,
        address: order.shippingAddress,
      });
      autoTracking = label.trackingNumber;
      autoCarrier = "OTHER"; // mock: admin sonradan dogru firmayi secer
    } catch (err) {
      console.error("[shipping] label creation failed", err);
    }
  }
  const finalTrackingNumber = trackingNumber ?? autoTracking ?? undefined;
  const finalCarrier =
    trackingCarrier !== undefined ? trackingCarrier : autoCarrier ?? undefined;
  const finalCarrierName =
    trackingCarrierName !== undefined ? trackingCarrierName : undefined;
  const finalEta =
    estimatedDeliveryAt !== undefined
      ? estimatedDeliveryAt
        ? new Date(estimatedDeliveryAt)
        : null
      : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (isCancellingNow) {
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      if (order.paymentMethod === "OPEN_ACCOUNT") {
        const dealer = await tx.dealer.findUnique({
          where: { userId: order.userId },
          select: { id: true },
        });
        if (dealer) {
          await writeLedgerEntry(tx, {
            dealerId: dealer.id,
            kind: "ORDER_CANCEL_CREDIT",
            amount: -Number(order.total),
            orderId: order.id,
            note: `Iptal: ${order.orderNumber}`,
            createdBy: gate.session.user.id,
          });
        }
      }
    }

    const updatedOrder = await tx.order.update({
      where: { id },
      data: {
        status,
        trackingNumber: finalTrackingNumber,
        trackingCarrier: finalCarrier,
        trackingCarrierName: finalCarrierName,
        estimatedDeliveryAt: finalEta,
        adminNote: adminNote ?? undefined,
        shippedAt: isShippingNow ? new Date() : undefined,
        deliveredAt: isDeliveringNow ? new Date() : undefined,
        paymentStatus:
          status === "DELIVERED" && order.paymentMethod === "CREDIT_CARD"
            ? "PAID"
            : status === "CANCELLED" && order.paymentStatus === "PAID"
              ? "REFUNDED"
              : undefined,
      },
    });

    // Statu degistiyse OrderEvent kaydi at. adminNote varsa event'e
    // eklenir (timeline'da gozukur).
    if (statusChanged) {
      await tx.orderEvent.create({
        data: {
          orderId: id,
          type: STATUS_TO_EVENT[status],
          note: adminNote ?? null,
          actorId: gate.session.user.id,
        },
      });
    } else if (adminNote) {
      // Statu ayni ama admin not yazdi — serbest bir NOTE event'i.
      await tx.orderEvent.create({
        data: {
          orderId: id,
          type: "NOTE",
          note: adminNote,
          actorId: gate.session.user.id,
        },
      });
    }

    return updatedOrder;
  });

  if (updated && statusChanged) {
    logAudit({
      actorId: gate.session.user.id,
      action: "ORDER_STATUS_CHANGE",
      entityType: "order",
      entityId: updated.id,
      metadata: {
        from: order.status,
        to: status,
        trackingNumber: trackingNumber ?? null,
      },
    });
    after(() => {
      // E11 — CANCELLED jenerik mesaj yerine ozel "iptal edildi" mesaji
      // (iptal sebebi + iade bilgisi). Diger durumlarda mevcut akis.
      const tpl =
        status === "CANCELLED"
          ? templateOrderCancelled({
              customerName: order.shippingName,
              orderNumber: order.orderNumber,
              total: Number(order.total),
              paymentMethod: order.paymentMethod,
              reason: adminNote ?? null,
            })
          : templateOrderStatusChanged({
              customerName: order.shippingName,
              orderNumber: order.orderNumber,
              status,
              trackingNumber: finalTrackingNumber ?? order.trackingNumber ?? null,
              carrier: updated.trackingCarrier,
              carrierName: updated.trackingCarrierName,
              estimatedDeliveryAt: updated.estimatedDeliveryAt,
            });
      queueEmail({ ...tpl, to: order.user.email });
    });

    // KolayBi e-fatura: sipariş DELIVERED'a geçince invoice kayıt + (env
    // yapılandırılmışsa) gönderim. Hata olursa siparişi etkilemez (after()
    // içinde fire-and-forget).
    if (isDeliveringNow) {
      const orderId = updated.id;
      after(async () => {
        try {
          const r = await ensureInvoiceForOrder(orderId);
          if (r.created) {
            await sendPendingInvoice(r.invoiceId).catch((err) => {
              console.error("[invoice] send failed", orderId, err);
            });
          }
        } catch (err) {
          console.error("[invoice] ensure failed", orderId, err);
        }
      });
    }
  }

  return NextResponse.json({ id: updated?.id, status: updated?.status });
}
