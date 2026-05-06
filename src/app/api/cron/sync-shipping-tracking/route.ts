import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { shippingAdapter, shippingConfigured } from "@/lib/adapters/shipping";

export const dynamic = "force-dynamic";

/**
 * SHIPPED siparişlerin tracking event'lerini Shipentegra'dan çek + OrderEvent
 * upsert. Webhook gelmediği veya kaybolduğu durumlar için fallback.
 *
 * Schedule: 30 dk (vercel.json'da `*​/30 * * * *`).
 *
 * Limit: aynı anda 50 sipariş (rate limit'i koru). Daha eski SHIPPED'lar
 * sıraya girer.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  if (!shippingConfigured()) {
    return NextResponse.json({ ok: true, skipped: "shipping_not_configured" });
  }

  // Son 30 gün SHIPPED + henüz DELIVERED olmamış siparişler
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      status: "SHIPPED",
      trackingNumber: { not: null },
      shippedAt: { gte: cutoff },
    },
    select: { id: true, trackingNumber: true },
    take: 50,
    orderBy: { shippedAt: "asc" },
  });

  let synced = 0;
  let errors = 0;
  let eventsCreated = 0;

  for (const order of orders) {
    if (!order.trackingNumber) continue;
    try {
      const events = await shippingAdapter.fetchTracking(order.trackingNumber);
      for (const ev of events) {
        const exists = await prisma.orderEvent.findFirst({
          where: {
            orderId: order.id,
            type:
              ev.status === "DELIVERED"
                ? "DELIVERED"
                : ev.status === "PICKED_UP"
                ? "SHIPPED"
                : "NOTE",
            createdAt: ev.occurredAt,
          },
        });
        if (!exists) {
          await prisma.orderEvent.create({
            data: {
              orderId: order.id,
              type:
                ev.status === "DELIVERED"
                  ? "DELIVERED"
                  : ev.status === "PICKED_UP"
                  ? "SHIPPED"
                  : "NOTE",
              note: ev.description,
              createdAt: ev.occurredAt,
            },
          });
          eventsCreated++;
        }
        if (ev.status === "DELIVERED") {
          await prisma.order.updateMany({
            where: { id: order.id, status: { not: "DELIVERED" } },
            data: { status: "DELIVERED", deliveredAt: ev.occurredAt },
          });
        }
      }
      synced++;
    } catch (err) {
      console.error(
        "[cron:sync-shipping] error",
        order.trackingNumber,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  return NextResponse.json({ ok: true, synced, errors, eventsCreated });
}
