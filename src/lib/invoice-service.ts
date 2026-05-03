/**
 * Invoice service — sipariş DELIVERED'a geçince fatura kayıtı + KolayBi'ye
 * gönderim. Kapsam (Faz 20.A kararı):
 *
 *   ✅ Bayi siparişleri (DEALER role + companyName + taxNumber) için fatura kes
 *   ❌ Müşteri (CUSTOMER) siparişleri için kesim yok (T.C. kimlik yok)
 *
 * Akış:
 *   1. ensureInvoiceForOrder(orderId): idempotent DB kayıdı (Invoice row)
 *   2. sendPendingInvoice(invoiceId):
 *      a. Bayi → ensureKolaybiContact (associate + adres)
 *      b. Tüm ürünler için ensureKolaybiProduct
 *      c. createInvoice payload'ı oluştur ve POST
 *      d. Başarılı: status=SENT, externalId=document_id
 *      e. Hata: status=FAILED, errorMessage, attemptCount++
 *   3. retryFailedInvoices(): cron için PENDING/FAILED kuyruğu
 *
 * Mock mode (`KOLAYBI_MOCK=true`): adapter gerçek HTTP atmaz,
 * synthetic ID'ler döndürür → end-to-end test akışı credentials gelmeden
 * çalışır.
 *
 * DRYRUN (`!isOperational()`): hiçbir gönderim olmaz, status PENDING kalır.
 * Cron retry ileride credentials gelince devreye girer.
 */
import { prisma } from "@/lib/prisma";
import * as kolaybi from "@/lib/adapters/kolaybi";
import { logAudit } from "@/lib/audit";
import { queueEmail, templateInvoiceIssued } from "@/lib/email";
import type { Prisma } from "@prisma/client";

const MAX_ATTEMPTS = 5;
const RETRY_BATCH_SIZE = 20;

/** Invoice service hata sınıfları — caller'a anlamlı kategori sunar. */
export class InvoiceServiceError extends Error {
  reason: "NOT_DEALER" | "ORDER_NOT_DELIVERED" | "ORDER_NOT_FOUND";
  constructor(message: string, reason: InvoiceServiceError["reason"]) {
    super(message);
    this.name = "InvoiceServiceError";
    this.reason = reason;
  }
}

/**
 * Sipariş için Invoice kaydı oluştur (idempotent).
 * Sadece bayi siparişleri için kayıt açılır — customer siparişlerinde
 * fatura kesilmez (T.C. kimlik gereksinimi).
 */
export async function ensureInvoiceForOrder(orderId: string): Promise<{
  created: boolean;
  invoiceId: string;
  skippedReason?: "CUSTOMER_ORDER";
}> {
  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing) return { created: false, invoiceId: existing.id };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      status: true,
      user: { select: { role: true, dealer: { select: { id: true } } } },
    },
  });
  if (!order) {
    throw new InvoiceServiceError(`Order ${orderId} not found`, "ORDER_NOT_FOUND");
  }

  if (order.status !== "DELIVERED") {
    throw new InvoiceServiceError(
      `Order ${orderId} status=${order.status}, DELIVERED bekleniyor`,
      "ORDER_NOT_DELIVERED",
    );
  }

  // Faz 20.A: sadece bayi siparişlerine fatura
  if (order.user.role !== "DEALER" || !order.user.dealer) {
    return {
      created: false,
      invoiceId: "",
      skippedReason: "CUSTOMER_ORDER",
    };
  }

  const invoice = await prisma.invoice.create({
    data: {
      orderId,
      status: "PENDING",
      totalAmount: order.total,
      currency: "TRY",
    },
  });
  logAudit({
    actorId: "system",
    action: "INVOICE_CREATE",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: { orderId, totalAmount: Number(order.total) },
  });
  return { created: true, invoiceId: invoice.id };
}

/**
 * KolayBi tarafında bayinin Associate + address'ini ensure et.
 * İlk kesimde POST /associates yapılır (addresses[] embedded), ID'ler
 * Dealer.kolaybiContactId / kolaybiAddressId'ya cache'lenir.
 *
 * KolayBi response'unda `address: [{id, city, district, ...}]` (singular!)
 * döner — biz address[0].id'yi cache'liyoruz. Eğer response'ta address
 * yoksa fallback olarak ayrı endpoint POST /address/create kullanılır.
 */
async function ensureKolaybiContactForDealer(dealerId: string): Promise<{
  contactId: number;
  addressId: number;
}> {
  const dealer = await prisma.dealer.findUniqueOrThrow({
    where: { id: dealerId },
    include: {
      user: {
        include: {
          addresses: {
            where: { isDefault: true },
            take: 1,
          },
        },
      },
    },
  });

  if (dealer.kolaybiContactId && dealer.kolaybiAddressId) {
    return {
      contactId: dealer.kolaybiContactId,
      addressId: dealer.kolaybiAddressId,
    };
  }

  // Bayi default adresini KolayBi'ye gönder. Yoksa Dealer.taxOffice'tan
  // şehir tahmini yapamayız — bu durumda associate ID ile sonra adres aç.
  const defaultAddr = dealer.user.addresses[0];
  const isCorporate = dealer.taxNumber.length === 10;

  const created = await kolaybi.createContact({
    name: dealer.companyName,
    // KolayBi tüzel kişi için "surname" yine zorunlu — companyName'i ayır
    // veya placeholder ver
    surname: ".",
    identity_no: dealer.taxNumber,
    is_corporate: isCorporate,
    tax_office: dealer.taxOffice,
    email: dealer.user.email,
    phone: dealer.user.phone ?? undefined,
    code: `DEALER-${dealer.id.slice(0, 12)}`,
    // Adres bilgisini associate ile birlikte gonder — response'tan id alacagiz
    addresses: defaultAddr
      ? [
          {
            address: defaultAddr.addressLine,
            city: defaultAddr.city,
            district: defaultAddr.district,
            country: "Türkiye",
            address_type: "invoice",
            postal_code: defaultAddr.postalCode ?? undefined,
          },
        ]
      : undefined,
  });

  // Address ID — response'tan oku
  let addressId: number;
  if (created.address && created.address.length > 0) {
    addressId = created.address[0].id;
  } else if (defaultAddr) {
    // Response'ta gelmediyse ayri endpoint'le ekle (fallback)
    const addrResp = await kolaybi.createAddress({
      associate_id: created.id,
      address: defaultAddr.addressLine,
      city: defaultAddr.city,
      district: defaultAddr.district,
      country: "Türkiye",
      address_type: "invoice",
      postal_code: defaultAddr.postalCode ?? undefined,
    });
    addressId = addrResp.id;
  } else {
    // Bayi default adresi de yoksa minimal placeholder (vergi dairesi şehri)
    const addrResp = await kolaybi.createAddress({
      associate_id: created.id,
      city: "Istanbul",
      district: "Merkez",
      country: "Türkiye",
      address_type: "invoice",
    });
    addressId = addrResp.id;
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    data: {
      kolaybiContactId: created.id,
      kolaybiAddressId: addressId,
    },
  });

  return { contactId: created.id, addressId };
}

/**
 * Bir ürünün KolayBi karşılığını ensure et — cache hit ise return,
 * yoksa POST /products. ID Product.kolaybiProductId'a cache'lenir.
 */
async function ensureKolaybiProduct(productId: string): Promise<number> {
  const p = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      vatRate: true,
      kolaybiProductId: true,
    },
  });
  if (p.kolaybiProductId) return p.kolaybiProductId;

  const created = await kolaybi.createProduct({
    name: p.name,
    code: p.sku,
    barcode: p.sku,
    vat_rate: Number(p.vatRate),
    price: Number(p.price),
    price_currency: "try",
    sale_price_vat_included: true, // sistemimizde fiyatlar KDV dahil
    product_type: "good",
  });

  await prisma.product.update({
    where: { id: productId },
    data: { kolaybiProductId: created.id },
  });

  return created.id;
}

/**
 * Bir invoice kaydını KolayBi'ye gönder.
 *
 * DRYRUN (env yok ve mock kapalı) → status PENDING kalır, attemptCount artmaz.
 * Mock mode → synthetic ID'ler ile akış gerçekleşir.
 * Real mode → contact/product ensure + POST /invoices.
 */
export async function sendPendingInvoice(invoiceId: string): Promise<{
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  reason?: string;
}> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      order: {
        include: {
          items: true,
          user: {
            include: { dealer: true },
          },
        },
      },
    },
  });
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
  if (inv.status === "SENT" || inv.status === "CANCELLED") {
    return { status: inv.status };
  }

  if (!kolaybi.isOperational()) {
    return { status: "PENDING", reason: "KolayBi DRYRUN (env yok, mock kapalı)" };
  }

  if (inv.attemptCount >= MAX_ATTEMPTS) {
    if (inv.status !== "FAILED") {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "FAILED" },
      });
    }
    return { status: "FAILED", reason: "max attempts reached" };
  }

  // Faz 20.A guard — customer siparişine fatura kesemeyiz
  if (inv.order.user.role !== "DEALER" || !inv.order.user.dealer) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "CANCELLED",
        errorMessage: "Customer siparişine e-fatura kesilmez (T.C. kimlik yok)",
      },
    });
    return { status: "CANCELLED", reason: "customer order" };
  }

  // Concurrent send guard — atomik conditional update. Yalnız hâlâ
  // PENDING/FAILED ise attempt counter'ı artır. Eğer başka bir process
  // bu arada SENT/CANCELLED yapmışsa update fail olur ve send'i atlarız.
  // Bu sayede aynı invoice için paralel /admin/invoices/[id] çağrıları
  // KolayBi'ye iki kere fatura kesmez.
  const claimed = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    // Başka bir process bu invoice'i zaten gönderdi/iptal etti
    // veya attempt sınırı doldu. No-op ile çıkış.
    const fresh = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    });
    return { status: fresh?.status ?? "FAILED", reason: "concurrent or capped" };
  }

  try {
    const dealerId = inv.order.user.dealer.id;
    const { contactId, addressId } = await ensureKolaybiContactForDealer(dealerId);

    // Her order_item için product ensure
    const itemsWithKolaybiId: kolaybi.KolaybiInvoiceItem[] = [];
    for (const item of inv.order.items) {
      const kolaybiProductId = await ensureKolaybiProduct(item.productId);
      // OrderItem.discountPct (yüzde) → KolayBi discount_amount (tutar) hesabı
      // unitPrice * quantity * pct/100. Sıfır ise alanı atla.
      const discountAmount =
        Number(item.discountPct) > 0
          ? Math.round(
              Number(item.unitPrice) *
                item.quantity *
                (Number(item.discountPct) / 100) *
                100,
            ) / 100
          : 0;
      itemsWithKolaybiId.push({
        product_id: kolaybiProductId,
        quantity: String(item.quantity),
        unit_price: String(Number(item.unitPrice)),
        vat_rate: Number(item.vatRate),
        description: item.productName,
        ...(discountAmount > 0
          ? { discount_amount: String(discountAmount) }
          : {}),
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const orderDateIso = inv.order.createdAt.toISOString().slice(0, 10);
    // E-ticaret faturası — KolayBi'nin internet_sale field'i ile platformu
    // ve ödeme tipini taşımak best-practice (e-fatura/e-arşiv uyumluluğu).
    const paymentType: "credit-card" | "bank-transfer" =
      inv.order.paymentMethod === "CREDIT_CARD" ? "credit-card" : "bank-transfer";
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";

    const payload: kolaybi.KolaybiInvoicePayload = {
      contact_id: contactId,
      address_id: addressId,
      order_date: today,
      currency: "try",
      items: itemsWithKolaybiId,
      receiver_email: inv.order.user.email,
      type: "sale_invoice",
      document_scenario: "TICARIFATURA",
      document_type: "SATIS",
      description: `Sipariş ${inv.order.orderNumber}`,
      // Sipariş referansı — KolayBi tarafında orderNumber'ı görünür yap
      order_reference: {
        serial_no: inv.order.orderNumber,
        issue_date: orderDateIso,
      },
      // İnternet satışı bilgisi — e-ticaret faturalarında doldurulması önerilir
      internet_sale: {
        url: baseUrl,
        payment_type: paymentType,
        payment_date: orderDateIso,
      },
    };

    const response = await kolaybi.createInvoice(payload);

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "SENT",
        externalId: String(response.document_id),
        syncedAt: new Date(),
        errorMessage: null,
      },
    });

    logAudit({
      actorId: "system",
      action: "INVOICE_SEND",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: {
        orderId: inv.orderId,
        documentId: response.document_id,
        total: response.grand_total,
      },
    });

    // Bayiye e-fatura hazır maili — SMTP yoksa email_log'a DRYRUN olarak yazılır.
    // Fire-and-forget; mail başarısız olursa fatura yine başarılı sayılır.
    try {
      const dealerName = inv.order.user.dealer.companyName;
      const panelUrl = `${baseUrl}/bayi/faturalar`;
      const tpl = templateInvoiceIssued({
        companyName: dealerName,
        orderNumber: inv.order.orderNumber,
        documentId: response.document_id,
        total: Number(response.grand_total),
        panelUrl,
      });
      queueEmail({ ...tpl, to: inv.order.user.email });
    } catch {
      // Mail kuyruklama hatası — invoice success'i etkilemesin
    }

    return { status: "SENT" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let detail = message;
    if (err instanceof kolaybi.KolaybiError && err.apiMessage) {
      detail = `${err.apiMessage} (code ${err.apiCode ?? "?"})`;
    }
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "FAILED",
        errorMessage: detail.slice(0, 500),
      },
    });

    logAudit({
      actorId: "system",
      action: "INVOICE_FAIL",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { orderId: inv.orderId, error: detail.slice(0, 300) },
    });

    return { status: "FAILED", reason: detail };
  }
}

/**
 * Cron job için: PENDING/FAILED invoice'ları sırayla dener.
 *
 * Sıralama: en eski PENDING'lar önce. FAILED'lar attemptCount'tan az ise
 * yeniden dener. CANCELLED ve SENT atlanır.
 */
export async function retryFailedInvoices(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  const candidates = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "asc" },
    take: RETRY_BATCH_SIZE,
    select: { id: true },
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of candidates) {
    try {
      const r = await sendPendingInvoice(c.id);
      if (r.status === "SENT") succeeded++;
      else if (r.status === "FAILED") failed++;
      else skipped++; // PENDING (DRYRUN), CANCELLED
    } catch {
      failed++;
    }
  }

  if (candidates.length > 0) {
    logAudit({
      actorId: "system",
      action: "INVOICE_RETRY_BATCH",
      entityType: "invoice",
      entityId: "cron",
      metadata: {
        attempted: candidates.length,
        succeeded,
        failed,
        skipped,
      },
    });
  }

  return { attempted: candidates.length, succeeded, failed, skipped };
}

// Helper: Decimal serialize (Prisma'dan gelen Decimal'ı number'a çevir)
function _toNumber(v: Prisma.Decimal | number | string): number {
  return typeof v === "number" ? v : Number(v);
}
void _toNumber;
