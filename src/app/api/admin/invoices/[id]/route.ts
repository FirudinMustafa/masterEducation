import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { sendPendingInvoice } from "@/lib/invoice-service";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

/**
 * Admin manuel fatura tetikleme — admin "Yeniden Gönder" butonuna basınca.
 * Rate-limit: dakika başı admin başına 30 istek (spam koruması).
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const rl = rateLimit(`invoice-retry:${gate.session.user.id}`, 30, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla istek. Bir süre bekleyin." },
      { status: 429 },
    );
  }

  const { id } = await context.params;
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) {
    return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
  }

  try {
    const result = await sendPendingInvoice(id);
    logAudit({
      actorId: gate.session.user.id,
      action: "INVOICE_SEND",
      entityType: "invoice",
      entityId: id,
      metadata: { manual: true, status: result.status, reason: result.reason },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
