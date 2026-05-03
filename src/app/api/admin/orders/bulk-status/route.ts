import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import type { CargoCarrier, OrderEventType, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { queueEmail, templateOrderStatusChanged } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { writeLedgerEntry } from "@/lib/ledger";

const MAX_IDS = 500;

const STATUS_TO_EVENT: Record<OrderStatus, OrderEventType> = {
  PENDING: "CREATED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const bodySchema = z
  .object({
    orderIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
    status: z
      .enum(["APPROVED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"])
      .optional(),
    trackingCarrier: z
      .enum([
        "ARAS",
        "YURTICI",
        "MNG",
        "PTT",
        "SURAT",
        "KOLAY_GELSIN",
        "HEPSIJET",
        "TRENDYOL",
        "OTHER",
      ])
      .nullable()
      .optional(),
    trackingCarrierName: z.string().max(100).nullable().optional(),
    estimatedDeliveryAt: z.string().datetime().nullable().optional(),
    adminNote: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.trackingCarrier !== undefined ||
      v.trackingCarrierName !== undefined ||
      v.estimatedDeliveryAt !== undefined ||
      (v.adminNote && v.adminNote.length > 0),
    { message: "En az bir alan guncellenmeli." }
  );

/**
 * Toplu sipariş durum/kargo güncellemesi.
 *
 * Tek tek aynı endpoint'i çağırmaktan kaçınmak için, bulk endpoint her sipariş
 * için ayrı transaction çalıştırır. Bir sipariş başarısız olsa bile diğerleri
 * etkilenmez (partial-success raporu).
 *
 * Tracking number bulk yerine sipariş başına otomatik üretilir veya admin
 * sonradan tek tek doldurur — bulk apply'da trackingNumber alanı atlanır.
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const {
    orderIds,
    status,
    trackingCarrier,
    trackingCarrierName,
    estimatedDeliveryAt,
    adminNote,
  } = parsed.data;

  const eta =
    estimatedDeliveryAt !== undefined
      ? estimatedDeliveryAt
        ? new Date(estimatedDeliveryAt)
        : null
      : undefined;

  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Tüm siparişleri bir kerede çek — gereksiz round-trip azalır.
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      total: true,
      userId: true,
      shippingName: true,
      user: { select: { email: true } },
    },
  });
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  for (const orderId of orderIds) {
    const order = orderMap.get(orderId);
    if (!order) {
      failed.push({ id: orderId, error: "Siparis bulunamadi." });
      continue;
    }

    const isCancellingNow =
      status === "CANCELLED" && order.status !== "CANCELLED";
    const wasCancelled = order.status === "CANCELLED";
    const isShippingNow =
      status === "SHIPPED" && order.status !== "SHIPPED";
    const isDeliveringNow =
      status === "DELIVERED" && order.status !== "DELIVERED";
    const statusChanged = status !== undefined && status !== order.status;

    if (wasCancelled && status && status !== "CANCELLED") {
      failed.push({
        id: orderId,
        error: "Iptal edilmis siparis tekrar aktif edilemez.",
      });
      continue;
    }

    // State machine — atlamalı geçiş engelle (PENDING→DELIVERED yasak vb.).
    // Tek tek admin akışıyla aynı whitelist (single-status route ile uyum).
    if (statusChanged && status) {
      const allowed: Record<typeof order.status, readonly typeof status[]> = {
        PENDING: ["APPROVED", "CANCELLED"],
        APPROVED: ["PROCESSING", "CANCELLED"],
        PROCESSING: ["SHIPPED", "CANCELLED"],
        SHIPPED: ["DELIVERED", "CANCELLED"],
        DELIVERED: [],
        CANCELLED: [],
      };
      if (!allowed[order.status].includes(status)) {
        failed.push({
          id: orderId,
          error: `${order.status} → ${status} geçişi izinli değil.`,
        });
        continue;
      }
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        if (isCancellingNow) {
          // Stok geri yükle
          const items = await tx.orderItem.findMany({
            where: { orderId },
            select: { productId: true, quantity: true },
          });
          for (const item of items) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stockQuantity: { increment: item.quantity } },
            });
          }
          // Open account ise ledger
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

        const upd = await tx.order.update({
          where: { id: orderId },
          data: {
            ...(status !== undefined && { status }),
            ...(trackingCarrier !== undefined && {
              trackingCarrier: trackingCarrier as CargoCarrier | null,
            }),
            ...(trackingCarrierName !== undefined && {
              trackingCarrierName,
            }),
            ...(eta !== undefined && { estimatedDeliveryAt: eta }),
            ...(adminNote ? { adminNote } : {}),
            ...(isShippingNow && { shippedAt: new Date() }),
            ...(isDeliveringNow && { deliveredAt: new Date() }),
            ...(status === "DELIVERED" &&
              order.paymentMethod === "CREDIT_CARD" && {
                paymentStatus: "PAID" as const,
              }),
            ...(status === "CANCELLED" &&
              order.paymentStatus === "PAID" && {
                paymentStatus: "REFUNDED" as const,
              }),
          },
        });

        if (statusChanged && status) {
          await tx.orderEvent.create({
            data: {
              orderId,
              type: STATUS_TO_EVENT[status],
              note: adminNote ?? null,
              actorId: gate.session.user.id,
            },
          });
        } else if (adminNote) {
          await tx.orderEvent.create({
            data: {
              orderId,
              type: "NOTE",
              note: adminNote,
              actorId: gate.session.user.id,
            },
          });
        }

        return upd;
      });

      succeeded.push(orderId);

      if (statusChanged && status) {
        after(() => {
          const tpl = templateOrderStatusChanged({
            customerName: order.shippingName,
            orderNumber: order.orderNumber,
            status,
            trackingNumber: updated.trackingNumber ?? null,
            carrier: updated.trackingCarrier,
            carrierName: updated.trackingCarrierName,
            estimatedDeliveryAt: updated.estimatedDeliveryAt,
          });
          queueEmail({ ...tpl, to: order.user.email });
        });
      }
    } catch (e) {
      failed.push({
        id: orderId,
        error: e instanceof Error ? e.message : "Bilinmeyen hata",
      });
    }
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "ORDER_BULK_STATUS_CHANGE",
    entityType: "order",
    entityId: "bulk",
    metadata: {
      requested: orderIds.length,
      succeeded: succeeded.length,
      failed: failed.length,
      status,
      trackingCarrier,
      sampleIds: orderIds.slice(0, 20),
    },
  });

  return NextResponse.json({
    succeeded: succeeded.length,
    failed,
    total: orderIds.length,
  });
}
