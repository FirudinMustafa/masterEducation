import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { iyzicoAdapter, iyzicoConfigured } from "@/lib/adapters/iyzico";
import { logAudit } from "@/lib/audit";
import { flattenZodError } from "@/lib/validations";

/**
 * Iyzico 3DS init — kullanıcı checkout'tan sonra "Ödeme yap"a basınca çağrılır.
 *
 * Adımlar:
 *   1. PaymentSession oluştur (status=PENDING, expiresAt = now+15min)
 *   2. Iyzico'ya init at, payment page URL al
 *   3. Token + URL'i client'a döndür → client iframe veya redirect ile 3DS popup'ı açar
 *   4. 3DS sonrası Iyzico bizim `IYZICO_CALLBACK_URL`'imize POST atar (callback route)
 */

const schema = z.object({
  orderId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!iyzicoConfigured() && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Odeme sistemi suan kullanilamiyor (config eksik)." },
      { status: 503 }
    );
  }

  const session = await auth();
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { orderId } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      address: true,
      items: { select: { productId: true, productName: true, lineTotal: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Siparis bulunamadi." }, { status: 404 });
  }
  // Misafir checkout'ta session yok ama orderId yeterli (path query token gibi);
  // üye ise userId eşleşmesi zorunlu.
  if (session?.user && session.user.id !== order.userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }
  if (order.paymentStatus === "PAID") {
    return NextResponse.json(
      { error: "Bu siparis zaten odenmis." },
      { status: 409 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "0.0.0.0";

  // PaymentSession.orderId @unique — bir siparişe iki paralel session olamaz.
  // Mock akışta zaten oluşturulduysa onu yeniden kullan; aksi halde yeni oluştur.
  const initialToken = `iyzico-init-${crypto.randomUUID()}`;
  const paymentSession = await prisma.paymentSession.upsert({
    where: { orderId: order.id },
    update: {
      status: "PENDING",
      token: initialToken,
      amount: order.total,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
    create: {
      orderId: order.id,
      token: initialToken,
      status: "PENDING",
      amount: order.total,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  const callbackUrl = `${baseUrl}/api/payments/iyzico/callback`;

  const [firstName, ...rest] = (order.shippingName ?? "Misafir Misafir").split(" ");

  const result = await iyzicoAdapter.init({
    paymentId: paymentSession.id,
    total: Number(order.total),
    currency: "TRY",
    customer: {
      id: order.userId,
      name: firstName || "Misafir",
      surname: rest.join(" ") || "Musteri",
      email: order.user?.email ?? order.guestEmail ?? "guest@example.com",
      phone: order.shippingPhone,
      ip,
    },
    billing: {
      address: order.shippingAddress,
      city: order.shippingCity,
    },
    items: order.items.map((it) => ({
      id: it.productId,
      name: it.productName,
      category: "Kitap",
      price: Number(it.lineTotal),
    })),
    callbackUrl,
  });

  if (!result.ok) {
    await prisma.paymentSession.update({
      where: { id: paymentSession.id },
      data: { status: "FAILED" },
    });
    logAudit({
      actorId: session?.user?.id ?? null,
      action: "ORDER_STATUS_CHANGE",
      entityType: "order",
      entityId: order.id,
      metadata: {
        provider: "iyzico",
        stage: "init",
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    });
    return NextResponse.json(
      { error: "Odeme baslatilamadi.", code: result.errorCode },
      { status: 502 }
    );
  }

  // Iyzico'nun providerToken'ını PaymentSession.token alanına yaz — callback
  // route'u bunu lookup için kullanır.
  await prisma.paymentSession.update({
    where: { id: paymentSession.id },
    data: { token: result.providerToken || paymentSession.token },
  });

  return NextResponse.json({
    paymentSessionId: paymentSession.id,
    paymentPageUrl: result.paymentPageUrl,
    providerToken: result.providerToken,
  });
}
