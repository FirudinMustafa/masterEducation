import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shippingAdapter } from "@/lib/adapters/shipping";

/**
 * Shipentegra webhook — kargo statü değişimleri (PICKED_UP, IN_TRANSIT,
 * OUT_FOR_DELIVERY, DELIVERED, RETURNED, FAILED).
 *
 * Idempotency: Shipentegra retry yapabilir → `OrderEvent` upsert (occurredAt
 * + type unique). Aynı event ikinci kez gelirse no-op.
 *
 * Güvenlik: HMAC-SHA256 signature header (`x-shipentegra-signature`).
 */

type ShipentegraEvent = {
  trackingNumber: string;
  status:
    | "CREATED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "RETURNED"
    | "FAILED";
  description?: string;
  occurredAt: string;
  carrierCode?: string;
};

const STATUS_TO_EVENT_TYPE: Record<
  ShipentegraEvent["status"],
  "SHIPPED" | "DELIVERED" | "PROCESSING" | "CANCELLED" | "NOTE"
> = {
  CREATED: "PROCESSING",
  PICKED_UP: "SHIPPED",
  IN_TRANSIT: "NOTE",
  OUT_FOR_DELIVERY: "NOTE",
  DELIVERED: "DELIVERED",
  RETURNED: "CANCELLED",
  FAILED: "NOTE",
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-shipentegra-signature") ?? "";

  if (!shippingAdapter.verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: ShipentegraEvent;
  try {
    payload = JSON.parse(rawBody) as ShipentegraEvent;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!payload.trackingNumber || !payload.status || !payload.occurredAt) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { trackingNumber: payload.trackingNumber },
  });
  if (!order) {
    // Bilinmeyen tracking — 200 dön (Shipentegra retry'ı durdursun).
    console.warn(
      "[shipping:webhook] unknown tracking",
      payload.trackingNumber
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  const occurredAt = new Date(payload.occurredAt);
  const eventType = STATUS_TO_EVENT_TYPE[payload.status];

  // Dedupe: aynı orderId + type + occurredAt kombinasyonu varsa atla.
  const exists = await prisma.orderEvent.findFirst({
    where: {
      orderId: order.id,
      type: eventType,
      createdAt: occurredAt,
    },
  });
  if (!exists) {
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: eventType,
        note: payload.description ?? `Kargo durumu: ${payload.status}`,
        createdAt: occurredAt,
      },
    });
  }

  // Order status mapping
  const updates: Record<string, unknown> = {};
  if (payload.status === "PICKED_UP" && !order.shippedAt) {
    updates.status = "SHIPPED";
    updates.shippedAt = occurredAt;
  } else if (payload.status === "DELIVERED") {
    updates.status = "DELIVERED";
    updates.deliveredAt = occurredAt;
  }
  if (Object.keys(updates).length > 0) {
    await prisma.order.update({ where: { id: order.id }, data: updates });
  }

  return NextResponse.json({ ok: true });
}
