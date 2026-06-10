/**
 * Invoice service — siparişi KolayBi'ye fatura KAYDI (taslak) olarak aktarır.
 *
 * Taslak/kayıt modeli: KolayBi `POST /invoices` yalnızca ön muhasebe satış
 * faturası KAYDI oluşturur; resmi e-fatura (GİB gönderimi,
 * `/invoices/e-document/create`) BİLİNÇLİ olarak tetiklenmez — gerçek kesim
 * KolayBi panelinden elle yapılır. Bu yüzden bu adımda bayiye e-posta gitmez,
 * yalnız muhasebeye "taslak aktarıldı" bildirimi gönderilir.
 *
 * Tetikleme: sipariş verilir verilmez otomatik (orders route `after()`),
 * sipariş DELIVERED olduğunda tekrar (status route `after()`), ve admin sipariş
 * detayından elle buton (CANCELLED hariç). Hepsi idempotent.
 *
 * Kapsam (Faz 20.A kararı):
 *   ✅ Bayi siparişleri (DEALER role + companyName + taxNumber) için kayıt aç
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
 * DRYRUN (`!isOperational()` — env yapılandırılmamış): hiçbir gönderim olmaz,
 * status PENDING kalır. Cron retry ileride credentials gelince devreye girer.
 */
import { prisma } from "@/lib/prisma";
import * as kolaybi from "@/lib/adapters/kolaybi";
import { logAudit } from "@/lib/audit";
import {
  queueEmail,
  templateInvoiceIssuedAccountingNotice,
  templateInvoiceRetryExhaustedAdminNotice,
} from "@/lib/email";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

const MAX_ATTEMPTS = 5;
const RETRY_BATCH_SIZE = 20;

/** Invoice service hata sınıfları — caller'a anlamlı kategori sunar. */
export class InvoiceServiceError extends Error {
  reason: "NOT_DEALER" | "ORDER_CANCELLED" | "ORDER_NOT_FOUND";
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

  // Taslak/kayıt modeli: sipariş verilir verilmez KolayBi'ye kayıt aktarılır
  // (panelde elle düzenlenip fatura kesilecek). Yalnız iptal edilmiş siparişe
  // kayıt açmayız.
  if (order.status === "CANCELLED") {
    throw new InvoiceServiceError(
      `Order ${orderId} CANCELLED — iptal edilmiş siparişe fatura kaydı açılmaz`,
      "ORDER_CANCELLED",
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

  // NOT: Adresi associate'e GÖMEREK (addresses[]) göndermiyoruz — KolayBi
  // sandbox'ında embedded adres country'i hatalı işliyor ve country "Türkiye"
  // dahi olsa "Ülke eşleşmiyor." (400) ile reddediliyor. Ayrı /address/create
  // endpoint'i ise country: "Türkiye" ile sorunsuz çalışıyor. Bu yüzden contact'ı
  // adressiz oluşturup adresi her zaman ayrı çağrıyla ekliyoruz.
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
  });

  // Address ID — adres her zaman ayrı endpoint'le eklenir (yukarıdaki nota bak).
  let addressId: number;
  if (created.address && created.address.length > 0) {
    // (İleride embedded adres düzelirse otomatik kullanılır.)
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
 * DRYRUN (env yok) → status PENDING kalır, attemptCount artmaz; env dolunca
 * cron retry devreye girer.
 * Yapılandırılmış → contact/product ensure + POST /invoices.
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

  // Sipariş iptal edildiyse faturayı KolayBi'ye GÖNDERME. Ödeme-iptal yolları
  // (mock/iyzico callback+webhook) siparişi CANCELLED yapıp faturaya dokunmuyordu;
  // bu guard sayesinde retry-cron iptal edilmiş siparişin faturasını gerçek
  // kayıt olarak göndermez. Fatura kaydı da CANCELLED'a çekilir.
  if (inv.order.status === "CANCELLED") {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "CANCELLED",
        errorMessage: "Sipariş iptal edildi — fatura gönderilmedi",
      },
    });
    return { status: "CANCELLED", reason: "order cancelled" };
  }

  // İdempotency: KolayBi'de kayıt zaten oluşmuş (externalId dolu) ama status
  // SENT değilse (önceki denemede createInvoice başarılı olup DB yazımı
  // patlamış olabilir) — TEKRAR createInvoice YAPMA, sadece SENT'e çek.
  // Aksi halde aynı sipariş için ikinci bir KolayBi faturası oluşur.
  if (inv.externalId) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "SENT", syncedAt: inv.syncedAt ?? new Date(), errorMessage: null },
    });
    return { status: "SENT", reason: "already has externalId — reconciled" };
  }

  if (!kolaybi.isOperational()) {
    return { status: "PENDING", reason: "KolayBi DRYRUN (env yapılandırılmamış)" };
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

  // createInvoice yanıtını dış kapsamda tut — catch'te "KolayBi'de kayıt oluştu
  // mu?" kararını verip, oluştuysa FAILED'a düşürmeden mükerrer kesimi önlemek için.
  let response: kolaybi.KolaybiInvoiceResponse | null = null;
  try {
    const dealerId = inv.order.user.dealer.id;
    const { contactId, addressId } = await ensureKolaybiContactForDealer(dealerId);

    // Her order_item için product ensure + KDV dönüşümü.
    //
    // ÖNEMLİ KDV mantığı: bizim `unitPrice` KDV DAHİL ve İSKONTOLU (dealerPrice =
    // listPrice × (1 − iskonto)). KolayBi ise birim fiyatı KDV HARİÇ kabul edip
    // üstüne KDV ekler. Bu yüzden:
    //   - unit_price = unitPrice / (1 + vat/100)  (KDV hariç tabana çevir)
    //   - discount_amount GÖNDERMEYİZ (iskonto zaten unitPrice'a gömülü; ayrıca
    //     göndermek çift iskonto olurdu).
    // Böylece KolayBi satır toplamı = unitExVat × adet × (1+vat/100) = lineTotal
    // (bizim KDV dahil tutarımız) → birebir tutar. (sandbox ile doğrulandı)
    const itemsWithKolaybiId: kolaybi.KolaybiInvoiceItem[] = [];
    let sumInclVat = 0; // kalemlerin KDV dahil toplamı (kupon oranı için)
    let sumVat = 0; // kalemlerin KDV tutarı toplamı
    for (const item of inv.order.items) {
      const kolaybiProductId = await ensureKolaybiProduct(item.productId);
      const vatRate = Number(item.vatRate);
      const unitInclVat = Number(item.unitPrice);
      const unitExVat = Math.round((unitInclVat / (1 + vatRate / 100)) * 10000) / 10000;
      sumInclVat += Number(item.lineTotal);
      sumVat += Number(item.vatAmount);
      itemsWithKolaybiId.push({
        product_id: kolaybiProductId,
        quantity: String(item.quantity),
        unit_price: String(unitExVat),
        vat_rate: vatRate,
        description: item.productName,
      });
    }

    // Kupon iskontosu (varsa) → genel iskonto. KolayBi subtotal_discount_amount'ı
    // da KDV HARİÇ ister. couponDiscount bizde KDV dahil; KDV payını düşerek
    // tabana indir (tek KDV oranında birebir, karışık oranda en iyi tahmin).
    const couponDiscount = Number(inv.order.couponDiscount ?? 0);
    let subtotalDiscountExVat = 0;
    if (couponDiscount > 0 && sumInclVat > 0) {
      const vatFraction = sumVat / sumInclVat;
      subtotalDiscountExVat =
        Math.round(couponDiscount * (1 - vatFraction) * 100) / 100;
    }

    // Fatura tarihi = sipariş tarihi (butona basılan gün DEĞİL — geç aktarımda
    // muhasebe tarihi kaymasın). KolayBi panelinde gerekiyorsa elle düzeltilir.
    const orderDateIso = inv.order.createdAt.toISOString().slice(0, 10);
    // E-ticaret faturası — KolayBi'nin internet_sale field'i ile platformu
    // ve ödeme tipini taşımak best-practice (e-fatura/e-arşiv uyumluluğu).
    const paymentType: "credit-card" | "bank-transfer" =
      inv.order.paymentMethod === "CREDIT_CARD" ? "credit-card" : "bank-transfer";
    const baseUrl = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";

    const payload: kolaybi.KolaybiInvoicePayload = {
      contact_id: contactId,
      address_id: addressId,
      order_date: orderDateIso,
      currency: "try",
      items: itemsWithKolaybiId,
      receiver_email: inv.order.user.email,
      type: "sale_invoice",
      document_scenario: "TICARIFATURA",
      document_type: "SATIS",
      description: `Sipariş ${inv.order.orderNumber}`,
      // Belirli bir seri zorlanmak istenirse env'den; normalde boş bırakılır
      // ve KolayBi panelinde tanımlı varsayılan ön ek kullanılır.
      ...(env.KOLAYBI_INVOICE_PREFIX
        ? { serial_no: env.KOLAYBI_INVOICE_PREFIX }
        : {}),
      // Kupon iskontosu → genel iskonto (KDV hariç). Yoksa alan gönderilmez.
      ...(subtotalDiscountExVat > 0
        ? { subtotal_discount_amount: subtotalDiscountExVat }
        : {}),
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

    // NOT: Burada yalnızca KolayBi ön muhasebe satış faturası KAYDI oluşturulur.
    // Resmi e-fatura (GİB'e gönderim) bilinçli olarak tetiklenmez —
    // /kolaybi/v1/invoices/e-document/create ÇAĞRILMAZ. Gerçek e-fatura kesimi
    // muhasebe ekibi tarafından KolayBi panelinden elle yapılır.
    response = await kolaybi.createInvoice(payload);

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

    // Taslak/kayıt modeli — bu adımda BAYİYE e-posta gönderilmez: resmi e-fatura
    // henüz kesilmedi (panelden elle kesilecek). Yalnız muhasebeye "taslak
    // aktarıldı, panelden kesin" bildirimi gider. Fire-and-forget; mail
    // başarısız olursa fatura kaydı yine başarılı sayılır.
    try {
      const dealerName = inv.order.user.dealer.companyName;

      // Muhasebe bildirimi — taslak aktarımı + panelden kesim çağrısı.
      const accountingTo = env.ACCOUNTING_EMAIL;
      if (accountingTo) {
        const accTpl = templateInvoiceIssuedAccountingNotice({
          orderNumber: inv.order.orderNumber,
          dealerCompany: dealerName,
          documentId: response.document_id,
          total: Number(response.grand_total),
          panelUrl: `${baseUrl}/admin/faturalar`,
        });
        queueEmail({ ...accTpl, to: accountingTo });
      }
    } catch {
      // Mail kuyruklama hatası — invoice success'i etkilemesin
    }

    return { status: "SENT" };
  } catch (err) {
    // #5 İdempotency kurtarma: createInvoice BAŞARILI olduysa (response var)
    // ama sonraki adım patladıysa → KolayBi'de kayıt OLUŞTU. FAILED işaretlersek
    // cron retry MÜKERRER fatura açar. Bu yüzden SENT olarak kurtar.
    if (response) {
      const docId = response.document_id;
      await prisma.invoice
        .update({
          where: { id: invoiceId },
          data: {
            status: "SENT",
            externalId: String(docId),
            syncedAt: new Date(),
            errorMessage: null,
          },
        })
        .catch((e2) =>
          console.error(
            `[invoice] createInvoice OK fakat DB persist hatası — KolayBi belge=${docId} invoice=${invoiceId}`,
            e2,
          ),
        );
      return { status: "SENT" };
    }

    const message = err instanceof Error ? err.message : String(err);
    let detail = message;
    if (err instanceof kolaybi.KolaybiError && err.apiMessage) {
      detail = `${err.apiMessage} (code ${err.apiCode ?? "?"})`;
    }

    // #4 Terminal yapılandırma hataları (ön ek/kanal) retry ile düzelmez —
    // attemptCount'u tavana çekip cron'un boşuna denemesini engelle ve mesajı
    // aksiyon alınabilir hâle getir. Eşik dolduğu için tek seferlik net uyarı
    // maili (aşağıdaki blok) admin + muhasebeye gider.
    const terminal = err instanceof kolaybi.KolaybiError && err.isTerminalConfig;
    if (err instanceof kolaybi.KolaybiError && err.isPrefixError) {
      detail =
        "KolayBi panelinde fatura ön eki tanımlı değil (Ayarlar → e-Belge Ön Ekleri). Tanımladıktan sonra tekrar deneyin.";
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: "FAILED",
        errorMessage: detail.slice(0, 500),
        ...(terminal ? { attemptCount: MAX_ATTEMPTS } : {}),
      },
      select: { attemptCount: true },
    });

    logAudit({
      actorId: "system",
      action: "INVOICE_FAIL",
      entityType: "invoice",
      entityId: invoiceId,
      metadata: { orderId: inv.orderId, error: detail.slice(0, 300) },
    });

    // E19 — N defa retry tukendigi anda admin'e manuel mudahale uyarısi.
    // attemptCount yukarida atomik increment edildi; eseik basinca tek mail.
    if (updated.attemptCount >= MAX_ATTEMPTS) {
      const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
      const tpl = templateInvoiceRetryExhaustedAdminNotice({
        orderNumber: inv.order.orderNumber,
        dealerCompany: inv.order.user.dealer?.companyName ?? "—",
        total: Number(inv.totalAmount),
        lastError: detail,
        panelUrl: `${base}/admin/faturalar`,
      });
      // Hem admin hem muhasebe kutusuna bildir (tekrarsiz set).
      const recipients = new Set(
        [env.ADMIN_EMAIL ?? BRAND.email, env.ACCOUNTING_EMAIL].filter(
          (x): x is string => Boolean(x),
        ),
      );
      for (const to of recipients) {
        queueEmail({ ...tpl, to });
      }
    }

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
