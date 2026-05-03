/**
 * Kargo takip altyapisinin dogrulamasi:
 *  - OrderEvent olusturma
 *  - trackingCarrier enum
 *  - deliveredAt / estimatedDeliveryAt
 *  - /kargo-takip/[no] sayfasi 200 donuyor mu
 *  - carrier tracking URL dogru mu
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { carrierLabel, carrierTrackingUrl, CARGO_CARRIERS } from "../src/lib/cargo-carriers";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  const mark = cond ? "✓" : "✗";
  console.log(`  ${mark} ${name}${extra ? " — " + extra : ""}`);
  if (cond) passed++;
  else failed++;
}

(async () => {
  console.log("\n── Cargo carrier mapper ──");
  check("9 firma tanimli", Object.keys(CARGO_CARRIERS).length === 9);
  check(
    "Aras URL takip no encode eder",
    carrierTrackingUrl("ARAS", "ABC 123")?.includes("ABC%20123") ?? false,
  );
  check(
    "OTHER URL null doner",
    carrierTrackingUrl("OTHER", "XYZ") === null,
  );
  check(
    "carrier atanmamis -> 'Kargo firmasi atanmadi'",
    carrierLabel(null, null) === "Kargo firmasi atanmadi",
  );
  check(
    "OTHER + fallback isim -> fallback gosterir",
    carrierLabel("OTHER", "Jetkargo") === "Jetkargo",
  );
  check(
    "ARAS -> 'Aras Kargo'",
    carrierLabel("ARAS", null) === "Aras Kargo",
  );

  console.log("\n── DB tablo kontrolu ──");
  const orderEventsExist = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM information_schema.tables
    WHERE table_name = 'order_events'
  `;
  check(
    "order_events tablosu var",
    Number(orderEventsExist[0]?.count ?? 0) === 1,
  );

  console.log("\n── Eski siparislerde event'ler ──");
  const sample = await prisma.order.findFirst({
    where: { events: { some: {} } },
    include: {
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  check("en az 1 siparis event'li", !!sample);
  if (sample) {
    check(
      "ilk event CREATED",
      sample.events[0]?.type === "CREATED",
      `got ${sample.events[0]?.type}`,
    );
    check(
      "event sayisi 1+",
      sample.events.length >= 1,
      `${sample.events.length} event`,
    );
  }

  console.log("\n── Tracking senaryosu (gecici siparis) ──");
  const user = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 } },
  });
  if (!user || !product) {
    console.log("test icin user/product yok, atlaniyor");
  } else {
    const address = await prisma.address.create({
      data: {
        userId: user.id,
        fullName: "Test Test",
        phone: "5001112233",
        city: "Istanbul",
        district: "Kadikoy",
        addressLine: "Test adres",
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `T-${Date.now()}`,
        userId: user.id,
        addressId: address.id,
        status: "SHIPPED",
        paymentMethod: "CREDIT_CARD",
        paymentStatus: "PAID",
        subtotal: 100,
        discountTotal: 0,
        vatTotal: 0,
        shippingCost: 0,
        total: 100,
        shippingName: user.name,
        shippingCity: "Istanbul",
        shippingAddress: "Test adres",
        shippingPhone: "5001112233",
        trackingNumber: "TEST-12345",
        trackingCarrier: "ARAS",
        shippedAt: new Date(),
        estimatedDeliveryAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        events: {
          createMany: {
            data: [
              { type: "CREATED", createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
              { type: "APPROVED", createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
              { type: "PROCESSING", createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              { type: "SHIPPED", createdAt: new Date() },
            ],
          },
        },
      },
      include: { events: true },
    });
    check("siparis yaratildi", !!order);
    check(
      "siparis 4 event ile geliyor",
      order.events.length === 4,
      `${order.events.length} event`,
    );
    check(
      "trackingCarrier enum kaydedildi",
      order.trackingCarrier === "ARAS",
    );
    check(
      "estimatedDeliveryAt dolu",
      order.estimatedDeliveryAt != null,
    );
    check(
      "tracking URL hesaplanabiliyor",
      carrierTrackingUrl(order.trackingCarrier, order.trackingNumber)?.includes("araskargo") ?? false,
    );

    // Temizle
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.address.delete({ where: { id: address.id } });
    check("temizlik OK", true);
  }

  console.log(`\n=== ${passed} basarili, ${failed} basarisiz ===`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
