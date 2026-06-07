import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/api-auth";
import {
  ensureInvoiceForOrder,
  sendPendingInvoice,
  InvoiceServiceError,
} from "@/lib/invoice-service";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

/**
 * Admin sipariş bazlı KolayBi taslak fatura aktarımı — sipariş detayındaki
 * "KolayBi'ye Aktar" butonu buraya gelir. Invoice kaydı yoksa açar
 * (ensureInvoiceForOrder), sonra KolayBi'ye gönderir (sendPendingInvoice).
 *
 * Yalnızca ön muhasebe satış faturası KAYDI oluşturur; resmi e-fatura
 * (GİB gönderimi) tetiklenmez — panelden elle kesilir.
 *
 * Rate-limit: dakika başı admin başına 30 istek (spam koruması).
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const rl = rateLimit(`order-invoice:${gate.session.user.id}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla istek. Bir süre bekleyin." },
      { status: 429 },
    );
  }

  const { id: orderId } = await context.params;

  try {
    const ensured = await ensureInvoiceForOrder(orderId);
    if (ensured.skippedReason === "CUSTOMER_ORDER") {
      return NextResponse.json(
        { error: "Müşteri siparişine fatura kesilmez (yalnızca bayi siparişleri)." },
        { status: 422 },
      );
    }

    const result = await sendPendingInvoice(ensured.invoiceId);

    logAudit({
      actorId: gate.session.user.id,
      action: "INVOICE_SEND",
      entityType: "invoice",
      entityId: ensured.invoiceId,
      metadata: {
        manual: true,
        orderId,
        created: ensured.created,
        status: result.status,
        reason: result.reason,
      },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InvoiceServiceError) {
      const status = err.reason === "ORDER_NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: err.message }, { status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
