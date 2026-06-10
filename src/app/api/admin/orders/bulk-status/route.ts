import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import type { CargoCarrier, OrderEventType, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import {
  queueEmail,
  templateOrderStatusChanged,
  templateOrderCancelled,
  templateInvoiceCancelledAccountingNotice,
} from "@/lib/email";
import { logAudit } from "@/lib/audit";
import {
  applyOrderCancelSideEffects,
  applyOrderReactivateSideEffects,
} from "@/lib/order-side-effects";
import { canTransition } from "@/lib/order-status";
import { env } from "@/lib/env";

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
      .enum(["PENDING", "APPROVED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"])
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
        "DEPODAN_TESLIM",
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
    { message: "En az bir alan güncellenmeli." }
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
      failed.push({ id: orderId, error: "Sipariş bulunamadi." });
      continue;
    }

    const isCancellingNow =
      status === "CANCELLED" && order.status !== "CANCELLED";
    const wasCancelled = order.status === "CANCELLED";
    // Reaktivasyon: yanlışlıkla iptal edilen sipariş PENDING'e geri alınır.
    const isReactivating = wasCancelled && status === "PENDING";
    const isShippingNow =
      status === "SHIPPED" && order.status !== "SHIPPED";
    const isDeliveringNow =
      status === "DELIVERED" && order.status !== "DELIVERED";
    const statusChanged = status !== undefined && status !== order.status;

    // State machine — atlamalı geçiş engelle (PENDING→DELIVERED yasak vb.).
    // Tek kaynak @/lib/order-status (tekil form + toplu modal ile uyum).
    // CANCELLED yalnız PENDING'e geri alınabilir (reaktivasyon).
    if (statusChanged && status) {
      if (!canTransition(order.status, status)) {
        failed.push({
          id: orderId,
          error: `${order.status} → ${status} geçişi izinli değil.`,
        });
        continue;
      }
    }

    // İptalde KolayBi'de kesilmiş fatura belge no'su (varsa) — muhasebe bildirimi için.
    let cancelledKolaybiDoc: string | null = null;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        // İptal/reaktivasyon yan etkileri ortak helper'da (tekil status route ile
        // birebir aynı: stok + cari + kupon + fatura). Önceki bug: bulk burada
        // kupon + fatura yan etkilerini atlıyordu.
        if (isCancellingNow) {
          const r = await applyOrderCancelSideEffects(
            tx,
            order,
            gate.session.user.id
          );
          cancelledKolaybiDoc = r.cancelledKolaybiDoc;
        }

        if (isReactivating) {
          await applyOrderReactivateSideEffects(tx, order, gate.session.user.id);
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
            ...(isReactivating &&
              order.paymentStatus === "REFUNDED" && {
                paymentStatus: "PAID" as const,
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
          // E11 — CANCELLED özel mail (iade bilgisi).
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
                  trackingNumber: updated.trackingNumber ?? null,
                  carrier: updated.trackingCarrier,
                  carrierName: updated.trackingCarrierName,
                  estimatedDeliveryAt: updated.estimatedDeliveryAt,
                });
          queueEmail({ ...tpl, to: order.user.email });
        });
      }

      // İptal edilen siparişin KolayBi'de zaten oluşmuş faturası varsa →
      // muhasebeye "panelden iptal et" bildirimi (tekil route ile aynı).
      if (cancelledKolaybiDoc) {
        const docId = cancelledKolaybiDoc;
        const { userId, orderNumber } = order;
        after(async () => {
          try {
            const accountingTo = env.ACCOUNTING_EMAIL;
            if (!accountingTo) return;
            const dealer = await prisma.dealer.findUnique({
              where: { userId },
              select: { companyName: true },
            });
            const base =
              process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
            const tpl = templateInvoiceCancelledAccountingNotice({
              orderNumber,
              dealerCompany: dealer?.companyName ?? "—",
              documentId: docId,
              panelUrl: `${base}/admin/faturalar`,
            });
            queueEmail({ ...tpl, to: accountingTo });
          } catch (err) {
            console.error("[invoice] cancel notice failed", orderNumber, err);
          }
        });
      }
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "CREDIT_LIMIT_EXCEEDED"
          ? "Reaktivasyon başarısız: bayinin kredi limiti yetersiz."
          : e instanceof Error
            ? e.message
            : "Bilinmeyen hata";
      failed.push({ id: orderId, error: msg });
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
