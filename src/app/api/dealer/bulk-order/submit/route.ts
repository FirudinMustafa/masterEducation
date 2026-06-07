import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { calculateDealerPrice, getDealerDiscountRules } from "@/lib/pricing";
import { writeLedgerEntry } from "@/lib/ledger";
import { queueEmail, templateOrderCreated, templateOrderCreatedAdminNotice } from "@/lib/email";
import { flattenZodError, orderCreateSchema } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";

// Shipping schema'sı `orderCreateSchema` ile birebir aynı — TR phone normalize +
// il/ilçe whitelist refine. Bu sayede normal checkout ile bulk-order arasında
// validation tutarsızlığı kalmaz.
const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(100000),
      })
    )
    .min(1)
    .max(500),
  shipping: orderCreateSchema.shape.shipping,
  note: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  // Toplu sipariş yalnız bayi tarafından verilir → okul adı zorunlu.
  schoolName: z.string().trim().min(1, "Okul adı zorunludur.").max(200),
});

export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    // P2-API-2: bilinmeyen DB hataları stack/sql metni response body'sine sızabilir.
    // Generic 500 + server log; gerçek hata Sentry/console'a düşer.
    console.error("[bulk-order/submit] unhandled", err);
    return NextResponse.json(
      { error: "Sipariş oluşturulamadi.", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

async function handlePost(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER" || !session.user.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  if (session.user.dealerStatus !== "APPROVED") {
    return NextResponse.json(
      { error: "Bayiliginiz henuz onaylanmamis." },
      { status: 403 }
    );
  }
  // Bulk-order yalniz cari hesap modunda anlamli; pesin bayi her sipariş icin
  // kart girmesi gerektigi icin bu akis kapali.
  if (session.user.dealerPaymentTerms === "PREPAID") {
    return NextResponse.json(
      {
        error:
          "Toplu sipariş yalniz cari hesap modunda kullanilabilir. Hesabiniz pesin olarak tanimli.",
        code: "PREPAID_DEALER_BULK_FORBIDDEN",
      },
      { status: 403 }
    );
  }
  const dealerId = session.user.dealerId;

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { items, shipping, note, schoolName } = parsed.data;

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, isPublished: true },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      vatRate: true,
      stockQuantity: true,
      publisherId: true,
      categoryId: true,
      discountGroup: true,
    },
  });
  if (products.length !== items.length) {
    return NextResponse.json(
      { error: "Bazi ürünler bulunamadi veya yayinda degil." },
      { status: 400 }
    );
  }

  const rules = await getDealerDiscountRules(dealerId);
  let subtotal = 0;
  let discountTotal = 0;
  let vatTotal = 0;
  const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)!;
    if (product.stockQuantity < item.quantity) {
      return NextResponse.json(
        { error: `${product.name} icin yeterli stok yok.` },
        { status: 400 }
      );
    }

    const pricing = calculateDealerPrice(
      {
        id: product.id,
        price: Number(product.price),
        categoryId: product.categoryId,
        publisherId: product.publisherId,
        discountGroup: product.discountGroup,
      },
      rules
    );
    const unitPrice = pricing.dealerPrice;
    const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
    const lineList = pricing.listPrice * item.quantity;
    const vatRate = Number(product.vatRate);
    const vatAmount =
      vatRate > 0
        ? Math.round((lineTotal * vatRate) / (100 + vatRate) * 100) / 100
        : 0;

    subtotal += lineList;
    discountTotal += lineList - lineTotal;
    vatTotal += vatAmount;

    orderItemsData.push({
      product: { connect: { id: product.id } },
      quantity: item.quantity,
      unitPrice,
      discountPct: pricing.discountPct,
      lineTotal,
      vatRate,
      vatAmount,
      productName: product.name,
      productSku: product.sku,
    });
  }

  const netSubtotal = subtotal - discountTotal;
  // Bayi B2B avantajı: her zaman ücretsiz kargo (orders/route.ts ile aynı kural).
  // Bulk-order yalnız bayi tarafından çağrılabildiği için sabit 0.
  const shippingCost = 0;
  const total = Math.round((netSubtotal + shippingCost) * 100) / 100;
  vatTotal = Math.round(vatTotal * 100) / 100;

  // Credit-limit guard happens atomically inside writeLedgerEntry
  // (enforceCreditLimit: true). A pre-check here would be nicer UX but is not
  // safe under concurrency.

  const order = await prisma.$transaction(async (tx) => {
    // Defansif: bayi arasi SUSPENDED olmus olabilir — session stale olabilir.
    const live = await tx.dealer.findUnique({
      where: { id: dealerId },
      select: { status: true },
    });
    if (!live || live.status !== "APPROVED") {
      throw new Error("DEALER_NOT_APPROVED");
    }

    for (const item of items) {
      const r = await tx.product.updateMany({
        where: { id: item.productId, stockQuantity: { gte: item.quantity } },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      if (r.count === 0) throw new Error("STOCK_CONFLICT");
    }

    const existingAddress = await tx.address.findFirst({
      where: {
        userId: session.user.id,
        fullName: shipping.fullName,
        phone: shipping.phone,
        city: shipping.city,
        district: shipping.district || "",
        postalCode: shipping.postalCode || null,
        addressLine: shipping.address,
      },
      select: { id: true },
    });

    const address =
      existingAddress ??
      (await tx.address.create({
        data: {
          userId: session.user.id,
          fullName: shipping.fullName,
          phone: shipping.phone,
          city: shipping.city,
          district: shipping.district,
          postalCode: shipping.postalCode || null,
          addressLine: shipping.address,
        },
      }));

    const created = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: session.user.id,
        addressId: address.id,
        status: "PENDING",
        paymentMethod: "OPEN_ACCOUNT",
        paymentStatus: "PENDING",
        subtotal,
        discountTotal,
        vatTotal,
        shippingCost,
        total,
        note,
        schoolName,
        shippingName: shipping.fullName,
        shippingCity: shipping.city,
        shippingAddress: shipping.address,
        shippingPhone: shipping.phone,
        items: { create: orderItemsData },
        // OrderEvent timeline kaydi — admin panelde bulk-order'in da
        // "Sipariş oluşturuldu" satiri görünmeli (orders/route.ts ile uyum).
        events: {
          create: {
            type: "CREATED",
            actorId: session.user.id,
          },
        },
      },
    });

    await writeLedgerEntry(tx, {
      dealerId,
      kind: "ORDER_DEBIT",
      amount: total,
      orderId: created.id,
      note: `Toplu sipariş: ${created.orderNumber}`,
      enforceCreditLimit: true,
    });

    return created;
  }).catch((err) => {
    if (err instanceof Error && err.message === "STOCK_CONFLICT") return "STOCK_CONFLICT";
    if (err instanceof Error && err.message === "CREDIT_LIMIT_EXCEEDED") return "CREDIT_LIMIT_EXCEEDED";
    if (err instanceof Error && err.message === "DEALER_NOT_APPROVED") return "DEALER_NOT_APPROVED";
    throw err;
  });

  if (order === "STOCK_CONFLICT") {
    return NextResponse.json(
      { error: "Sipariş oluşturulurken stok yetersiz kaldi." },
      { status: 409 }
    );
  }
  if (order === "CREDIT_LIMIT_EXCEEDED") {
    return NextResponse.json(
      { error: "Cari limit yetersiz." },
      { status: 400 }
    );
  }
  if (order === "DEALER_NOT_APPROVED") {
    return NextResponse.json(
      { error: "Bayi hesabiniz aktif degil." },
      { status: 403 }
    );
  }

  logAudit({
    actorId: session.user.id,
    action: "DEALER_BULK_ORDER",
    entityType: "order",
    entityId: order.id,
    metadata: { itemCount: items.length, total },
  });

  after(async () => {
    const tpl = templateOrderCreated(
      shipping.fullName,
      order.orderNumber,
      orderItemsData.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        lineTotal: Number(i.lineTotal),
      })),
      total
    );
    queueEmail({ ...tpl, to: shipping.email });

    // E1 (B2B varyant) — admin'e bayi sipariş bildirimi.
    const adminTo = env.ADMIN_EMAIL ?? BRAND.email;
    if (adminTo) {
      const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
      const dealer = await prisma.dealer
        .findUnique({ where: { id: dealerId }, select: { companyName: true } })
        .catch(() => null);
      const adminTpl = templateOrderCreatedAdminNotice({
        orderNumber: order.orderNumber,
        customerName: shipping.fullName,
        customerEmail: shipping.email,
        isB2B: true,
        isHighValue: total >= env.HIGH_VALUE_ORDER_THRESHOLD,
        total,
        itemCount: items.length,
        paymentMethod: "OPEN_ACCOUNT",
        panelUrl: `${base}/admin/siparisler/${order.id}`,
        dealerCompany: dealer?.companyName ?? null,
      });
      queueEmail({ ...adminTpl, to: adminTo });
    }
  });

  return NextResponse.json({
    success: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}
