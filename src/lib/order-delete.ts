import type { Prisma } from "@prisma/client";

/**
 * Bir siparişi KALICI siler ve mali/stok yan etkilerini tutarlı bırakır.
 * Tek bir `prisma.$transaction` içinde çağrılmalı.
 *
 * Adımlar:
 *  1. Stok iadesi — sipariş CANCELLED *değilse* (iptal zaten stoğu geri
 *     yüklemiştir; iki kez eklememek için).
 *  2. Ledger uzlaştırma — siparişe bağlı DealerLedger satırları silinir ve
 *     `dealer.currentBalance` bu satırların net toplamı kadar geri alınır.
 *     (Aktif OPEN_ACCOUNT siparişinde net = +total → bakiye düşer; iptal
 *     edilmiş siparişte borç+kredi net = 0 → bakiye değişmez.) DealerLedger.orderId
 *     bir FK olmadığı için cascade etmez; elle silinir.
 *  3. Siparişi sil — OrderItem / OrderEvent / Invoice / PaymentSession /
 *     CouponRedemption `onDelete: Cascade` ile otomatik silinir.
 *
 * Geri alınamaz. Yalnız admin tarafından, test/yanlış sipariş temizliği için.
 */
export async function hardDeleteOrderTx(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<{ orderNumber: string }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      items: { select: { productId: true, quantity: true } },
    },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");

  // D1 güvenlik: KolayBi'de kesilmiş (SENT) faturası olan sipariş KALICI
  // silinemez — yasal kayıt + muhasebe bağı (externalId) korunur. Bu siparişi
  // silmek için önce iptal edilmeli (fatura CANCELLED'a çekilir + muhasebe
  // bildirimi gider). Caller bu hatayı yakalayıp anlamlı mesaj döndürmeli.
  const invoice = await tx.invoice.findUnique({
    where: { orderId },
    select: { status: true },
  });
  if (invoice && invoice.status === "SENT") {
    throw new Error("INVOICE_SENT");
  }

  // 1) Stok iadesi (iptal edilmemiş siparişlerde).
  if (order.status !== "CANCELLED") {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }

    // Kupon kullanımını geri ver — yalnız iptal EDİLMEMİŞ siparişte (iptal
    // zaten usedCount'u düşürmüştür). CouponRedemption satırı order silinince
    // cascade ile gider; usedCount'u burada elle düzeltiyoruz.
    const redemption = await tx.couponRedemption.findUnique({
      where: { orderId },
      select: { couponId: true },
    });
    if (redemption) {
      await tx.coupon.update({
        where: { id: redemption.couponId },
        data: { usedCount: { decrement: 1 } },
      });
    }
  }

  // 2) Ledger satırlarını sil + bayi bakiyesini uzlaştır.
  const ledgerEntries = await tx.dealerLedger.findMany({
    where: { orderId },
    select: { dealerId: true, amount: true },
  });
  if (ledgerEntries.length > 0) {
    const dealerId = ledgerEntries[0].dealerId;
    const netDelta = ledgerEntries.reduce((sum, e) => sum + Number(e.amount), 0);
    await tx.dealerLedger.deleteMany({ where: { orderId } });
    if (netDelta !== 0) {
      await tx.dealer.update({
        where: { id: dealerId },
        data: { currentBalance: { decrement: netDelta } },
      });
    }
  }

  // 3) Siparişi sil (alt kayıtlar cascade).
  await tx.order.delete({ where: { id: orderId } });

  return { orderNumber: order.orderNumber };
}
