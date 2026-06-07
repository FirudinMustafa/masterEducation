import { NextRequest, NextResponse, after } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateOrderNumber } from "@/lib/utils";
import { orderCreateSchema, flattenZodError } from "@/lib/validations";
import { calculateDealerPrice, getDealerDiscountRules } from "@/lib/pricing";
import { queueEmail, templateOrderCreated, templateOrderCreatedAdminNotice } from "@/lib/email";
import { ensureInvoiceForOrder, sendPendingInvoice } from "@/lib/invoice-service";
import { writeLedgerEntry } from "@/lib/ledger";
import { detectBrand, lastFour, luhnValid, normalizeCard, validExpiry } from "@/lib/card";
import { evaluateCoupon } from "@/lib/coupons";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";
import { getClientIp } from "@/lib/get-client-ip";

const PAYMENT_SESSION_TTL_MS = 15 * 60 * 1000;

const FREE_SHIPPING_THRESHOLD = 500;
const SHIPPING_COST = 29.9;

export async function POST(req: NextRequest) {
  try {
    // Spam koruma: saatte 20 sipariş/kullanici veya guest icin IP. Gercek
    // kullanıcı bu limiti asmaz, ama scripted spam'i keser.
    const session = await auth();
    // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali, QA 2026-05-18)
    const rlIp = getClientIp(req.headers);
    const rlKey = session?.user?.id
      ? `order-create:user:${session.user.id}`
      : `order-create:ip:${rlIp}`;
    const rl = rateLimit(rlKey, 20, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Çok sik sipariş oluşturma denemesi. Lütfen bir sure bekleyin." },
        { status: 429 }
      );
    }

    const json = await req.json();
    const parsed = orderCreateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: flattenZodError(parsed.error) },
        { status: 400 }
      );
    }

    const { items, shipping, paymentMethod, note, card, couponCode, schoolName } = parsed.data;
    const clientIp = rlIp;
    const contractsAcceptedAt = new Date();

    const isDealer = session?.user?.role === "DEALER";
    const dealerId = session?.user?.dealerId ?? null;
    const dealerStatus = session?.user?.dealerStatus ?? null;
    const dealerPaymentTerms = session?.user?.dealerPaymentTerms ?? null;

    // Bayi-only sistem: sipariş yalnız giriş yapmış bayiler tarafından verilebilir.
    // Misafir (girişsiz) ve müşteri siparişi kabul edilmez.
    if (!session?.user || !isDealer || !dealerId) {
      return NextResponse.json(
        { error: "Sipariş vermek için bayi girişi yapmalısınız." },
        { status: 401 }
      );
    }

    // Okul adı bayi siparişlerinde zorunlu — siparişin hangi okul için verildiği.
    if (!schoolName) {
      return NextResponse.json(
        { error: "schoolName: Okul adı zorunludur." },
        { status: 400 }
      );
    }

    if (paymentMethod === "OPEN_ACCOUNT") {
      if (!isDealer || !dealerId) {
        return NextResponse.json(
          { error: "Cari hesap ödemesi yalnizca bayilere acik." },
          { status: 403 }
        );
      }
      if (dealerStatus !== "APPROVED") {
        return NextResponse.json(
          { error: "Bayiliginiz henuz onaylanmamis." },
          { status: 403 }
        );
      }
      if (dealerPaymentTerms === "PREPAID") {
        return NextResponse.json(
          {
            error:
              "Hesabiniz pesin (kredi karti / havale) olarak tanimli. Cari hesap ödemesi kullanamazsiniz.",
            code: "PREPAID_DEALER_OPEN_ACCOUNT_FORBIDDEN",
          },
          { status: 403 }
        );
      }
    }

    let cardBrand: string | null = null;
    let cardLastFour: string | null = null;

    if (paymentMethod === "CREDIT_CARD") {
      if (!card) {
        return NextResponse.json(
          { error: "Kart bilgileri gerekli." },
          { status: 400 }
        );
      }
      const digits = normalizeCard(card.number);
      if (!luhnValid(digits)) {
        return NextResponse.json(
          { error: "Kart numarasi gecersiz." },
          { status: 400 }
        );
      }
      if (!validExpiry(card.expiry)) {
        return NextResponse.json(
          { error: "Son kullanma tarihi gecersiz." },
          { status: 400 }
        );
      }
      if (!/^\d{3,4}$/.test(card.cvv)) {
        return NextResponse.json(
          { error: "CVV gecersiz." },
          { status: 400 }
        );
      }
      cardBrand = detectBrand(digits);
      cardLastFour = lastFour(digits);
    }

    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isPublished: true },
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

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Bazi ürünler bulunamadi." },
        { status: 400 }
      );
    }

    const discountRules = dealerId ? await getDealerDiscountRules(dealerId) : [];

    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;
    const orderItemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return NextResponse.json(
          { error: "Bazi ürünler bulunamadi." },
          { status: 400 }
        );
      }
      // Faz 19: 0 TL ürünleri checkout'a sokma — payment gateway 0 TL'yi
      // reject eder ve cari hesap kayıtları 0 satırlarla kirlenir.
      // Admin yanlış fiyat girmiş olabilir; net hata mesajı dönelim.
      if (Number(product.price) <= 0) {
        return NextResponse.json(
          { error: `${product.name} fiyati gecersiz. Lütfen daha sonra tekrar deneyin.` },
          { status: 400 }
        );
      }
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
        discountRules
      );

      const unitPrice = pricing.dealerPrice;
      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      const lineList = pricing.listPrice * item.quantity;
      const vatRate = Number(product.vatRate);
      // Price is KDV-inclusive. Extract VAT portion: lineTotal * r / (100 + r)
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
    // Kargo kuralları:
    //   - netSubtotal === 0 ise kargo da 0 (bayi %100 iskonto durumu — kullanıcı
    //     "her ürün ücretsiz" beklerken sipariş 29.90 kargo'ya takılmasın)
    //   - DEALER role: bayi avantajı olarak her zaman ücretsiz kargo (B2B)
    //   - Diğer: 500 TL üstü ücretsiz, altı 29.90
    let shippingCost: number;
    if (netSubtotal === 0 || dealerId) {
      shippingCost = 0;
    } else {
      shippingCost = netSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    }
    vatTotal = Math.round(vatTotal * 100) / 100;

    // Apply coupon if provided.
    let couponDiscount = 0;
    let resolvedCoupon: { id: string; code: string } | null = null;
    if (couponCode) {
      const evalResult = await evaluateCoupon(couponCode, {
        subtotalAfterProductDiscounts: netSubtotal,
        shippingCost,
      });
      if (!evalResult.ok) {
        return NextResponse.json({ error: evalResult.message }, { status: 400 });
      }
      couponDiscount = evalResult.discount;
      if (evalResult.shippingDiscount > 0) {
        shippingCost = Math.max(0, shippingCost - evalResult.shippingDiscount);
      }
      resolvedCoupon = { id: evalResult.coupon.id, code: evalResult.coupon.code };
    }

    const total = Math.round((netSubtotal - couponDiscount + shippingCost) * 100) / 100;

    // Bayi-only: oturum guard yukarıda yapıldı; sipariş giriş yapan bayiye yazılır.
    const userId: string = session.user.id;

    // Credit-limit check happens atomically inside the transaction — see
    // writeLedgerEntry with enforceCreditLimit. Checking it here as well would
    // only produce nicer error UX but is not safe under concurrency.

    const result = await prisma.$transaction(async (tx) => {
      // Defensive re-check: session'daki dealerStatus JWT'den gelir ve biraz
      // stale olabilir. OPEN_ACCOUNT icin canli DB'den dogrulaariz —
      // APPROVED'dan cikmis bir bayi sipariş veremez.
      if (paymentMethod === "OPEN_ACCOUNT" && dealerId) {
        const live = await tx.dealer.findUnique({
          where: { id: dealerId },
          select: { status: true },
        });
        if (!live || live.status !== "APPROVED") {
          throw new Error("DEALER_NOT_APPROVED");
        }
      }

      for (const item of items) {
        const result = await tx.product.updateMany({
          where: {
            id: item.productId,
            stockQuantity: { gte: item.quantity },
          },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          throw new Error("STOCK_CONFLICT");
        }
      }

      const existingAddress = await tx.address.findFirst({
        where: {
          userId,
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
            userId,
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
          userId,
          addressId: address.id,
          status: "PENDING",
          paymentMethod,
          paymentStatus: "PENDING",
          subtotal,
          discountTotal,
          couponCode: resolvedCoupon?.code ?? null,
          couponDiscount,
          vatTotal,
          shippingCost,
          total,
          note,
          schoolName,
          shippingName: shipping.fullName,
          shippingCity: shipping.city,
          shippingAddress: shipping.address,
          shippingPhone: shipping.phone,
          contractsAcceptedAt,
          contractsAcceptedIp: clientIp.slice(0, 64),
          items: { create: orderItemsData },
          events: {
            create: [
              {
                type: "CREATED",
                actorId: userId,
              },
              {
                type: "CONTRACTS_ACCEPTED",
                actorId: userId,
                note: `Mesafeli Satis Sözleşmesi + On Bilgilendirme Formu onaylandi. IP: ${clientIp.slice(0, 64)}`,
              },
            ],
          },
        },
      });

      if (resolvedCoupon) {
        // Race-safe increment: do the maxUses check in a single UPDATE using raw
        // SQL so two concurrent orders can't both sneak past the cap.
        const bumped = await tx.$executeRaw`
          UPDATE "coupons"
             SET "usedCount" = "usedCount" + 1,
                 "updatedAt" = CURRENT_TIMESTAMP
           WHERE "id" = ${resolvedCoupon.id}
             AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
        `;
        if (Number(bumped) === 0) {
          throw new Error("COUPON_RACE");
        }
        await tx.couponRedemption.create({
          data: {
            couponId: resolvedCoupon.id,
            orderId: created.id,
            userId,
            amount: couponDiscount,
          },
        });
      }

      if (paymentMethod === "OPEN_ACCOUNT" && dealerId) {
        await writeLedgerEntry(tx, {
          dealerId,
          kind: "ORDER_DEBIT",
          amount: total,
          orderId: created.id,
          note: `Sipariş ${created.orderNumber}`,
          enforceCreditLimit: true,
        });
      }

      let paymentToken: string | null = null;
      if (paymentMethod === "CREDIT_CARD") {
        paymentToken = crypto.randomBytes(24).toString("hex");
        await tx.paymentSession.create({
          data: {
            orderId: created.id,
            token: paymentToken,
            amount: total as unknown as Prisma.Decimal,
            cardLastFour,
            cardBrand,
            expiresAt: new Date(Date.now() + PAYMENT_SESSION_TTL_MS),
          },
        });
      }

      return { order: created, paymentToken };
    });

    const { order, paymentToken } = result;

    logAudit({
      actorId: session?.user?.id ?? null,
      action: "ORDER_CREATE",
      entityType: "order",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        total,
        paymentMethod,
        itemCount: items.length,
        dealerId: dealerId ?? null,
        guest: !session?.user,
      },
    });

    // Sözleşme onayi audit (yasal kanit izi).
    logAudit({
      actorId: session?.user?.id ?? null,
      action: "ORDER_CONTRACTS_ACCEPTED",
      entityType: "order",
      entityId: order.id,
      metadata: {
        orderNumber: order.orderNumber,
        ip: clientIp.slice(0, 64),
        acceptedAt: contractsAcceptedAt.toISOString(),
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });

    after(() => {
      const orderEmail = templateOrderCreated(
        shipping.fullName,
        order.orderNumber,
        orderItemsData.map((i) => ({
          name: i.productName,
          quantity: i.quantity,
          lineTotal: Number(i.lineTotal),
        })),
        total,
        contractsAcceptedAt
      );
      queueEmail({ ...orderEmail, to: shipping.email });

      // E1 — Admin'e yeni sipariş bildirimi. isB2B/isHighValue bayraklari
      // ayri mail uretmez; tek sablonun icinde rozet/banner ile vurgulanir
      // (E7+E21 birleştirildi, gurultuyu azaltır).
      const adminTo = env.ADMIN_EMAIL ?? BRAND.email;
      if (adminTo) {
        const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
        const adminTpl = templateOrderCreatedAdminNotice({
          orderNumber: order.orderNumber,
          customerName: shipping.fullName,
          customerEmail: shipping.email,
          isB2B: !!dealerId,
          isHighValue: total >= env.HIGH_VALUE_ORDER_THRESHOLD,
          total,
          itemCount: items.length,
          paymentMethod,
          panelUrl: `${base}/admin/siparisler/${order.id}`,
          dealerCompany: null,
        });
        queueEmail({ ...adminTpl, to: adminTo });
      }
    });

    // Sipariş verilir verilmez KolayBi'ye taslak fatura kaydı aktarılır
    // (muhasebe panelde elle düzenleyip e-faturayı keser). Fire-and-forget:
    // KolayBi hatası siparişi ETKİLEMEZ. Env yoksa (DRYRUN) Invoice PENDING
    // kalır, cron sonra dener. Müşteri siparişlerinde invoiceId boş döner →
    // atlanır (bayi-only sistemde zaten hep bayi).
    const newOrderId = order.id;
    after(async () => {
      try {
        const r = await ensureInvoiceForOrder(newOrderId);
        if (r.invoiceId) {
          await sendPendingInvoice(r.invoiceId).catch((err) =>
            console.error("[invoice] create-push send failed", newOrderId, err),
          );
        }
      } catch (err) {
        console.error("[invoice] create-push ensure failed", newOrderId, err);
      }
    });

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
      orderId: order.id,
      paymentUrl: paymentToken ? `/odeme/3d/${paymentToken}` : null,
      requiresPayment: !!paymentToken,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STOCK_CONFLICT") {
      return NextResponse.json(
        { error: "Sipariş oluşturulurken stok yetersiz kaldi." },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "COUPON_RACE") {
      return NextResponse.json(
        { error: "Kupon kullanim limiti bu sirada doldu." },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "CREDIT_LIMIT_EXCEEDED") {
      return NextResponse.json(
        { error: "Cari limit yetersiz." },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === "DEALER_NOT_APPROVED") {
      return NextResponse.json(
        { error: "Bayi hesabiniz aktif degil." },
        { status: 403 }
      );
    }
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Sipariş oluşturulurken bir hata oluştu." },
      { status: 500 }
    );
  }
}
