/**
 * Gecmis siparisler icin OrderEvent doldur.
 * Yeni siparisler zaten olusturma aninda CREATED event'i kaydediyor,
 * ama migration'dan onceki kayitlarda events tablosu bos kaldi.
 *
 * Her siparis icin:
 *  - CREATED: createdAt
 *  - APPROVED (status >= APPROVED): createdAt (tam zaman yok, approximate)
 *  - PROCESSING (status >= PROCESSING): createdAt (approximate)
 *  - SHIPPED (status >= SHIPPED): shippedAt
 *  - DELIVERED (status === DELIVERED): deliveredAt (migration bunu updatedAt'ten doldurdu)
 *  - CANCELLED (status === CANCELLED): updatedAt
 */
import "dotenv/config";
import { PrismaClient, type OrderStatus, type OrderEventType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const STATUS_ORDER: OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

const STATUS_TO_EVENT: Record<OrderStatus, OrderEventType> = {
  PENDING: "CREATED",
  APPROVED: "APPROVED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

(async () => {
  const orders = await prisma.order.findMany({
    where: { events: { none: {} } },
    select: {
      id: true,
      status: true,
      createdAt: true,
      shippedAt: true,
      deliveredAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Eventsiz siparis: ${orders.length}`);
  if (orders.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let inserted = 0;
  for (const o of orders) {
    const events: Array<{ type: OrderEventType; createdAt: Date }> = [];

    if (o.status === "CANCELLED") {
      events.push({ type: "CREATED", createdAt: o.createdAt });
      events.push({ type: "CANCELLED", createdAt: o.updatedAt });
    } else {
      const idx = STATUS_ORDER.indexOf(o.status);
      // PENDING → sadece CREATED
      // APPROVED → CREATED + APPROVED
      // ... sirayla
      for (let i = 0; i <= idx; i++) {
        const s = STATUS_ORDER[i];
        let at: Date;
        if (s === "PENDING") at = o.createdAt;
        else if (s === "SHIPPED" && o.shippedAt) at = o.shippedAt;
        else if (s === "DELIVERED" && o.deliveredAt) at = o.deliveredAt;
        else {
          // APPROVED / PROCESSING — gercek tarih yok, createdAt ile shippedAt
          // arasini interpolate et (tam dogru degil ama timeline icin yeterli).
          const start = o.createdAt.getTime();
          const end = (o.shippedAt ?? o.deliveredAt ?? o.updatedAt).getTime();
          const frac = i / Math.max(1, STATUS_ORDER.indexOf(o.status));
          at = new Date(start + (end - start) * frac);
        }
        events.push({ type: STATUS_TO_EVENT[s], createdAt: at });
      }
    }

    await prisma.orderEvent.createMany({
      data: events.map((e) => ({
        orderId: o.id,
        type: e.type,
        createdAt: e.createdAt,
      })),
    });
    inserted += events.length;
  }

  console.log(`Insert edilen event: ${inserted} (${orders.length} siparis)`);
  await prisma.$disconnect();
})();
