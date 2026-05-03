import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadInvoiceOrder } from "@/lib/invoice-helpers";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

/**
 * Sipariş PDF'i — kullanıcı kendi siparişini, admin tüm siparişleri indirir.
 * GET /api/orders/[id]/pdf  →  application/pdf attachment
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await loadInvoiceOrder(
    id,
    session.user.role === "ADMIN" ? undefined : session.user.id
  );
  if (!order) {
    return NextResponse.json({ error: "Siparis bulunamadi." }, { status: 404 });
  }

  const pdf = await generateInvoicePdf(order);
  // Buffer → Uint8Array (Next.js Response için)
  const body = new Uint8Array(pdf);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="siparis-${order.orderNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
