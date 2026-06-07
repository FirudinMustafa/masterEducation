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
    return NextResponse.json({ error: "Sipariş bulunamadi." }, { status: 404 });
  }

  // Hiçbir PDF'de fiyat/toplam gösterilmez (admin dahil).
  const pdf = await generateInvoicePdf(order);
  // Buffer → Uint8Array (Next.js Response için)
  const body = new Uint8Array(pdf);

  // HTTP headerlar Latin-1; Turkce 'ş' (codepoint 351) ByteString'e cevrilemez
  // ve Response throw eder. ASCII fallback + RFC 5987 UTF-8 ile filename ver.
  const asciiName = `siparis-${order.orderNumber}.pdf`;
  const utf8Name = `sipariş-${order.orderNumber}.pdf`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
