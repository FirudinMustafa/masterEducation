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
import { writeLedgerEntry } from "@/lib/ledger";
import { shippingAdapter } from "@/lib/adapters/shipping";
import { ensureInvoiceForOrder, sendPendingInvoice } from "@/lib/invoice-service";
import { env } from "@/lib/env";

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
 * DELIVERED final state'tir. CANCELLED yalnız PENDING'e geri alınabilir
 * (yanlışlıkla iptal edilen sipariş için "reaktivasyon" — iptal yan etkileri
 * tersine çevrilir). Aynı state'e PATCH (sadece tracking/note güncelleme)
 * izinlidir — `statusChanged` guard'ı ile kontrol. Bu kural bulk-status route
 * ile birebir aynı.
 */
const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: ["PENDING"],
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
  // Reaktivasyon: yanlışlıkla iptal edilen sipariş PENDING'e geri alınır.
  // İptal sırasında yapılan stok iadesi + kredi iadesi tersine çevrilir.
  const isReactivating = wasCancelled && status === "PENDING";
  const isShippingNow =
    status === "SHIPPED" && order.status !== "SHIPPED";
  const isDeliveringNow =
    status === "DELIVERED" && order.status !== "DELIVERED";
  const statusChanged = status !== order.status;

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

  let updated: Awaited<ReturnType<typeof prisma.order.update>>;
  // İptal edilen siparişin KolayBi'de zaten kesilmiş (SENT) fatura belge no'su —
  // doluysa muhasebeye "panelden iptal et" bildirimi gider (after()).
  let cancelledKolaybiDoc: string | null = null;
  try {
    updated = await prisma.$transaction(async (tx) => {
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
            note: `İptal: ${order.orderNumber}`,
            createdBy: gate.session.user.id,
          });
        }
      }

      // F-1001: iptal halinde kupon kullanim sayısi geri verilmeli.
      const redemption = await tx.couponRedemption.findUnique({
        where: { orderId: id },
      });
      if (redemption) {
        await tx.coupon.update({
          where: { id: redemption.couponId },
          data: { usedCount: { decrement: 1 } },
        });
        await tx.couponRedemption.delete({ where: { orderId: id } });
      }

      // Fatura kaydı: iptalde PENDING/FAILED retry'ı durdur (iptal siparişe
      // fatura aktarılmasın), SENT ise KolayBi'de kayıt zaten oluşmuş →
      // muhasebe panelden elle iptal etmeli (after() bildirimi).
      const inv = await tx.invoice.findUnique({
        where: { orderId: id },
        select: { status: true, externalId: true },
      });
      if (inv && inv.status !== "CANCELLED") {
        await tx.invoice.update({
          where: { orderId: id },
          data: {
            status: "CANCELLED",
            errorMessage: `Sipariş iptal edildi: ${order.orderNumber}`,
          },
        });
        if (inv.status === "SENT" && inv.externalId) {
          cancelledKolaybiDoc = inv.externalId;
        }
      }
    }

    // Reaktivasyon (CANCELLED → PENDING): iptaldeki yan etkileri tersine çevir.
    // Stok tekrar düşülür, açık hesapta kredi tekrar borçlandırılır.
    // NOT: kupon couponRedemption iptalde silindiği için yeniden uygulanmaz
    // (couponId kaybolur) — gerekirse admin elle kupon işler.
    if (isReactivating) {
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        select: { productId: true, quantity: true },
      });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
      }

      if (order.paymentMethod === "OPEN_ACCOUNT") {
        const dealer = await tx.dealer.findUnique({
          where: { userId: order.userId },
          select: { id: true },
        });
        if (dealer) {
          // Kredi limiti aşılırsa CREDIT_LIMIT_EXCEEDED fırlatır → 400 dönülür.
          await writeLedgerEntry(tx, {
            dealerId: dealer.id,
            kind: "ORDER_DEBIT",
            amount: Number(order.total),
            orderId: order.id,
            note: `Reaktivasyon: ${order.orderNumber}`,
            createdBy: gate.session.user.id,
            enforceCreditLimit: true,
          });
        }
      }

      // İptalde CANCELLED'a çekilen ama KolayBi'de kaydı OLMAYAN faturayı
      // tekrar gönderilebilir yap (PENDING). KolayBi kaydı olan (externalId)
      // dokunulmaz — mükerrer kayıt olmasın, gerekirse panelden elle yönetilir.
      await tx.invoice.updateMany({
        where: { orderId: id, status: "CANCELLED", externalId: null },
        data: { status: "PENDING", errorMessage: null },
      });
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
