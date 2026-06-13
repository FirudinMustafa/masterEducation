import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { returnCreateSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

/**
 * Bayi iade talebi oluşturma.
 *
 * Yalnız "Tamamlandı" (DELIVERED) durumdaki, bayinin kendi siparişlerinden iade
 * talep edilebilir. Talep PENDING olarak açılır; stok/cari etkisi YOKtur —
 * admin onaylayınca uygulanır (bkz. /api/admin/returns/[id]).
 */
function generateReturnNumber(): string {
  // Tarih bilgisi olmadan (Date.now kısıtı yok burada — server route) basit
  // okunur numara: IADE-<random>. Çakışma olursa create unique hatası → retry.
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `IADE-${rand}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER" || !session.user.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  if (session.user.dealerStatus !== "APPROVED") {
    return NextResponse.json(
      { error: "Bayiliğiniz henüz onaylanmamış." },
      { status: 403 }
    );
  }
  const dealerId = session.user.dealerId;
  const userId = session.user.id;

  const json = await req.json().catch(() => ({}));
  const parsed = returnCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { orderId, reason, items } = parsed.data;

  // Sipariş bayiye ait ve teslim edilmiş (Tamamlandı) olmalı.
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
  }
  if (order.status !== "DELIVERED") {
    return NextResponse.json(
      { error: "Yalnız teslim edilmiş (Tamamlandı) siparişler için iade talebi oluşturulabilir." },
      { status: 400 }
    );
  }

  const itemMap = new Map(order.items.map((it) => [it.id, it]));
  const returnItems: Prisma.ReturnItemCreateManyReturnInput[] = [];
  let totalAmount = 0;

  for (const reqItem of items) {
    const orderItem = itemMap.get(reqItem.orderItemId);
    if (!orderItem) {
      return NextResponse.json(
        { error: "Seçilen kalem bu siparişe ait değil." },
        { status: 400 }
      );
    }
    if (reqItem.quantity > orderItem.quantity) {
      return NextResponse.json(
        {
          error: `"${orderItem.productName}" için iade adedi sipariş adedini (${orderItem.quantity}) aşamaz.`,
        },
        { status: 400 }
      );
    }
    const unitPrice = Number(orderItem.unitPrice);
    const lineTotal = unitPrice * reqItem.quantity;
    totalAmount += lineTotal;
    returnItems.push({
      productId: orderItem.productId,
      quantity: reqItem.quantity,
      unitPrice: orderItem.unitPrice,
      lineTotal: lineTotal as unknown as Prisma.Decimal,
      productName: orderItem.productName,
      productSku: orderItem.productSku,
    });
  }

  // returnNumber çakışırsa birkaç kez dene.
  let created: { id: string; returnNumber: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      const r = await prisma.return.create({
        data: {
          returnNumber: generateReturnNumber(),
          dealerId,
          orderId,
          reason,
          totalAmount: totalAmount as unknown as Prisma.Decimal,
          status: "PENDING",
          items: { createMany: { data: returnItems } },
        },
        select: { id: true, returnNumber: true },
      });
      created = r;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        continue; // returnNumber çakıştı, tekrar dene
      }
      throw err;
    }
  }
  if (!created) {
    return NextResponse.json(
      { error: "İade numarası üretilemedi, tekrar deneyin." },
      { status: 500 }
    );
  }

  logAudit({
    actorId: userId,
    action: "RETURN_CREATE",
    entityType: "return",
    entityId: created.id,
    metadata: {
      returnNumber: created.returnNumber,
      orderId,
      totalAmount,
      itemCount: returnItems.length,
    },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    returnNumber: created.returnNumber,
  });
}
