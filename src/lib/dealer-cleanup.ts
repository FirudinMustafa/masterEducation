import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyOrderCancelSideEffects } from "@/lib/order-side-effects";

export interface DealerCleanupResult {
  cancelledOrders: number;
  cancelledOrderNumbers: string[];
  ledgerEntriesPurged: number;
  documentsPurged: number;
  discountRulesPurged: number;
  previousBalance: number;
}

/**
 * Bayi'ye ait tüm yan kayıtlari temizler ve Dealer satirini siler.
 * User KORUNUR — bu helper sadece Dealer scope'undaki temizligi yapar.
 *
 * Yapilanlar:
 *  1) Aktif siparişleri (PENDING/APPROVED/PROCESSING/SHIPPED) CANCELLED'a çeker.
 *     - Stok geri yüklenir
 *     - paymentStatus PAID → REFUNDED, degilse FAILED
 *     - OrderEvent CANCELLED audit kaydi
 *  2) DELIVERED + paymentStatus=PENDING siparişleri → paymentStatus FAILED
 *     (status DELIVERED kalir, yasal kayıt). Bayi gittigi icin tahsilat
 *     beklenmez.
 *  3) DealerLedger / DealerDocument / DealerDiscount satirlari silinir.
 *  4) Dealer kaydi silinir.
 *
 * Cagiran tarafa (admin endpoint) sayılari doner — audit log icin.
 *
 * Transaction icinde calistirilir; tx parametresi opsiyonel — verilmezse
 * kendi transaction'ini acar.
 */
export async function cleanupDealerByUserId(
  userId: string,
  actorId: string | null,
  txArg?: Prisma.TransactionClient,
): Promise<DealerCleanupResult | null> {
  const run = async (
    tx: Prisma.TransactionClient,
  ): Promise<DealerCleanupResult | null> => {
    const dealer = await tx.dealer.findUnique({
      where: { userId },
      select: {
        id: true,
        companyName: true,
        currentBalance: true,
      },
    });
    if (!dealer) return null;

    const activeOrders = await tx.order.findMany({
      where: {
        userId,
        // Aktif (final olmayan) siparişler: Gelen Sipariş (PENDING/APPROVED),
        // Hazırlanıyor (PROCESSING), Dağıtımda (SHIPPED), Teslim Edilemeyen
        // (UNDELIVERED). DELIVERED/CANCELLED final → dahil değil.
        status: { in: ["PENDING", "APPROVED", "PROCESSING", "SHIPPED", "UNDELIVERED"] },
      },
      select: {
        id: true,
        orderNumber: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        userId: true,
      },
    });

    for (const order of activeOrders) {
      // Ortak iptal yan-etkileri (tekil/toplu iptal route'larıyla AYNI helper):
      // stok iadesi + açık hesap cari (ORDER_CANCEL_CREDIT) + KUPON usedCount
      // geri verme + FATURA iptali. Önceki hata: dealer-cleanup yalnız stok iade
      // ediyordu; kupon (global) ve fatura tutarsız kalıyordu.
      await applyOrderCancelSideEffects(
        tx,
        {
          id: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: order.paymentMethod,
          userId: order.userId,
          total: order.total,
        },
        actorId
      );
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          paymentStatus:
            order.paymentStatus === "PAID" ? "REFUNDED" : "FAILED",
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "CANCELLED",
          note: `Bayi silindigi icin otomatik iptal (${dealer.companyName})`,
          actorId,
        },
      });
    }

    await tx.order.updateMany({
      where: { userId, status: "DELIVERED", paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });

    const ledgerCount = await tx.dealerLedger.count({
      where: { dealerId: dealer.id },
    });
    const docCount = await tx.dealerDocument.count({
      where: { dealerId: dealer.id },
    });
    const discCount = await tx.dealerDiscount.count({
      where: { dealerId: dealer.id },
    });

    await tx.dealerDocument.deleteMany({ where: { dealerId: dealer.id } });
    await tx.dealerDiscount.deleteMany({ where: { dealerId: dealer.id } });
    await tx.dealerLedger.deleteMany({ where: { dealerId: dealer.id } });
    await tx.dealer.delete({ where: { id: dealer.id } });

    return {
      cancelledOrders: activeOrders.length,
      cancelledOrderNumbers: activeOrders.map((o) => o.orderNumber),
      ledgerEntriesPurged: ledgerCount,
      documentsPurged: docCount,
      discountRulesPurged: discCount,
      previousBalance: Number(dealer.currentBalance),
    };
  };

  if (txArg) return run(txArg);
  return prisma.$transaction(run);
}

/**
 * Dealer ID ile siler (UI bayi panelinden cagrilan akis). Internal'da
 * userId'a çevirip ayni helper'a duser.
 */
export async function cleanupDealerById(
  dealerId: string,
  actorId: string | null,
): Promise<DealerCleanupResult | null> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { userId: true },
  });
  if (!dealer) return null;
  return cleanupDealerByUserId(dealer.userId, actorId);
}

// Avoid unused-imports-warning: PrismaClient type is referenced via Prisma.TransactionClient
export type _Unused = PrismaClient;
