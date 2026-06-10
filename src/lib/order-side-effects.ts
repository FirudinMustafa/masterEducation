import type { Prisma } from "@prisma/client";
import { writeLedgerEntry } from "@/lib/ledger";

/**
 * Sipariş iptal/reaktivasyon yan etkileri — TEK kaynak.
 *
 * Hem tekil (`/api/admin/orders/[id]/status`) hem toplu
 * (`/api/admin/orders/bulk-status`) route'lar bu helper'ları çağırır; böylece
 * stok + cari (ledger) + kupon + fatura zinciri iki yerde DIVERGE etmez
 * (önceki bug: bulk-status iptalde kupon + fatura yan etkilerini atlıyordu).
 *
 * Tümü `prisma.$transaction` içinde çağrılmalıdır.
 */

export interface OrderSideEffectInput {
  id: string;
  orderNumber: string;
  paymentMethod: "CREDIT_CARD" | "OPEN_ACCOUNT";
  userId: string;
  total: Prisma.Decimal | number;
}

/**
 * İptal yan etkileri:
 *  1. Stok iadesi (sipariş kalemleri kadar artır).
 *  2. Açık hesapsa ledger ORDER_CANCEL_CREDIT (borç geri ver).
 *  3. Kupon `usedCount` azalt — CouponRedemption satırı KORUNUR (reaktivasyonda
 *     kupon yeniden uygulanabilsin diye; eskiden silindiği için kupon kayboluyordu).
 *  4. Fatura kaydını CANCELLED yap. KolayBi'de zaten kesilmiş (SENT + externalId)
 *     ise belge no döndürülür → caller muhasebeye "panelden iptal et" bildirir.
 *
 * @returns KolayBi'de kesilmiş faturanın belge no'su (varsa), yoksa null.
 */
export async function applyOrderCancelSideEffects(
  tx: Prisma.TransactionClient,
  order: OrderSideEffectInput,
  actorId: string | null
): Promise<{ cancelledKolaybiDoc: string | null }> {
  // 1) Stok iadesi
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { productId: true, quantity: true },
  });
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stockQuantity: { increment: item.quantity } },
    });
  }

  // 2) Açık hesap ledger iadesi
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
        createdBy: actorId,
      });
    }
  }

  // 3) Kupon kullanımını geri ver (redemption KORUNUR → reaktivasyonda geri yüklenir)
  const redemption = await tx.couponRedemption.findUnique({
    where: { orderId: order.id },
    select: { couponId: true },
  });
  if (redemption) {
    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: { usedCount: { decrement: 1 } },
    });
  }

  // 4) Fatura kaydını iptal et
  let cancelledKolaybiDoc: string | null = null;
  const inv = await tx.invoice.findUnique({
    where: { orderId: order.id },
    select: { status: true, externalId: true },
  });
  if (inv && inv.status !== "CANCELLED") {
    await tx.invoice.update({
      where: { orderId: order.id },
      data: {
        status: "CANCELLED",
        errorMessage: `Sipariş iptal edildi: ${order.orderNumber}`,
      },
    });
    if (inv.status === "SENT" && inv.externalId) {
      cancelledKolaybiDoc = inv.externalId;
    }
  }

  return { cancelledKolaybiDoc };
}

/**
 * Reaktivasyon (CANCELLED → PENDING) yan etkileri — iptalin tersine çevrilmesi:
 *  1. Stok tekrar düşülür.
 *  2. Açık hesapsa ledger ORDER_DEBIT (kredi limiti zorunlu — aşılırsa
 *     "CREDIT_LIMIT_EXCEEDED" fırlatır, caller 400 döner).
 *  3. Kupon `usedCount` tekrar artırılır (redemption iptalde korunmuştu).
 *  4. KolayBi kaydı OLMAYAN (externalId null) iptal faturası tekrar PENDING yapılır.
 */
export async function applyOrderReactivateSideEffects(
  tx: Prisma.TransactionClient,
  order: OrderSideEffectInput,
  actorId: string | null
): Promise<void> {
  // 1) Stok tekrar düş
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { productId: true, quantity: true },
  });
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stockQuantity: { decrement: item.quantity } },
    });
  }

  // 2) Açık hesap ledger borç (kredi limiti zorunlu)
  if (order.paymentMethod === "OPEN_ACCOUNT") {
    const dealer = await tx.dealer.findUnique({
      where: { userId: order.userId },
      select: { id: true },
    });
    if (dealer) {
      await writeLedgerEntry(tx, {
        dealerId: dealer.id,
        kind: "ORDER_DEBIT",
        amount: Number(order.total),
        orderId: order.id,
        note: `Reaktivasyon: ${order.orderNumber}`,
        createdBy: actorId,
        enforceCreditLimit: true,
      });
    }
  }

  // 3) Kupon kullanımını tekrar say
  const redemption = await tx.couponRedemption.findUnique({
    where: { orderId: order.id },
    select: { couponId: true },
  });
  if (redemption) {
    await tx.coupon.update({
      where: { id: redemption.couponId },
      data: { usedCount: { increment: 1 } },
    });
  }

  // 4) KolayBi kaydı olmayan iptal faturasını tekrar gönderilebilir yap
  await tx.invoice.updateMany({
    where: { orderId: order.id, status: "CANCELLED", externalId: null },
    data: { status: "PENDING", errorMessage: null },
  });
}
