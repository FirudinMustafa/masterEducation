import { NextRequest, NextResponse, after } from "next/server";
import type { CargoCarrier, OrderEventType, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { orderStatusUpdateSchema, flattenZodError } from "@/lib/validations";
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
import { shippingAdapter } from "@/lib/adapters/shipping";
import { ensureInvoiceForOrder, sendPendingInvoice } from "@/lib/invoice-service";
import { env } from "@/lib/env";

const STATUS_TO_EVENT: Record<OrderStatus, OrderEventType> = {
  PENDING: "CREATED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  UNDELIVERED: "UNDELIVERED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

// Durum geçiş whitelist'i TEK KAYNAK @/lib/order-status'ten gelir (tekil form,
// toplu modal ve bulk route ile birebir aynı). okultedarigim akışı orada tanımlı.

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
    return NextResponse.json({ error: "Sipariş bulunamadi." }, { status: 404 });
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
  // Reaktivasyon: İptal/İade'den herhangi bir aktif duruma geçiş (serbest seçim).
  // İptal sırasında yapılan stok iadesi + kredi iadesi tersine çevrilir.
  const isReactivating = wasCancelled && status !== "CANCELLED";
  const isShippingNow =
    status === "SHIPPED" && order.status !== "SHIPPED";
  const isDeliveringNow =
    status === "DELIVERED" && order.status !== "DELIVERED";
  const statusChanged = status !== order.status;

  // Serbest durum seçimi: admin herhangi bir duruma geçebilir (geçiş whitelist'i
  // kaldırıldı). Bütünlük yan-etki tetikleyicileriyle korunur (iptal/reaktivasyon).

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

  let updated: Awaited<ReturnType<typeof prisma.order.update>>;
  // İptal edilen siparişin KolayBi'de zaten kesilmiş (SENT) fatura belge no'su —
  // doluysa muhasebeye "panelden iptal et" bildirimi gider (after()).
  let cancelledKolaybiDoc: string | null = null;
  try {
    updated = await prisma.$transaction(async (tx) => {
    // İptal/reaktivasyon yan etkileri ortak helper'da (tekil + bulk route ile
    // birebir aynı; stok + cari + kupon + fatura zinciri tek kaynaktan).
    if (isCancellingNow) {
      const r = await applyOrderCancelSideEffects(tx, order, gate.session.user.id);
      cancelledKolaybiDoc = r.cancelledKolaybiDoc;
    }

    if (isReactivating) {
      await applyOrderReactivateSideEffects(tx, order, gate.session.user.id);
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
              : isReactivating && order.paymentStatus === "REFUNDED"
                ? "PAID"
                : undefined,
      },
    });

    // Statu degistiyse OrderEvent kaydi at. adminNote varsa event'e
    // eklenir (timeline'da gözukur).
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
  } catch (e) {
    const msg =
      e instanceof Error && e.message === "CREDIT_LIMIT_EXCEEDED"
        ? "Sipariş yeniden aktifleştirilemedi: bayinin kredi limiti yetersiz."
        : "Güncelleme başarısız.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

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
      // E11 — CANCELLED jenerik mesaj yerine özel "iptal edildi" mesaji
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
          // Sipariş oluşturulurken zaten aktarılmış olabilir; ensure idempotent.
          // sendPendingInvoice de SENT'te no-op — bu çağrı FAILED kalmış kaydı
          // teslimde tekrar denemek için güvenlik ağı.
          const r = await ensureInvoiceForOrder(orderId);
          if (r.invoiceId) {
            await sendPendingInvoice(r.invoiceId).catch((err) => {
              console.error("[invoice] send failed", orderId, err);
            });
          }
        } catch (err) {
          console.error("[invoice] ensure failed", orderId, err);
        }
      });
    }

    // İptal edilen siparişin KolayBi'de zaten oluşmuş faturası varsa →
    // muhasebeye "panelden iptal et" bildirimi (fire-and-forget).
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
  }

  return NextResponse.json({ id: updated?.id, status: updated?.status });
}
