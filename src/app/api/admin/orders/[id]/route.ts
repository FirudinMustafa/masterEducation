import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { hardDeleteOrderTx } from "@/lib/order-delete";

/**
 * Siparişi KALICI siler (geri alınamaz). Yalnız admin.
 * Stok iadesi + ledger/bayi bakiyesi uzlaştırması yapılır, bağlı kayıtlar
 * cascade silinir. Test/yanlış sipariş temizliği içindir.
 * DELETE /api/admin/orders/[id]
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  try {
    const { orderNumber } = await prisma.$transaction((tx) =>
      hardDeleteOrderTx(tx, id)
    );

    logAudit({
      actorId: gate.session.user.id,
      action: "ORDER_DELETE",
      entityType: "order",
      entityId: id,
      metadata: { orderNumber },
    });

    return NextResponse.json({ ok: true, orderNumber });
  } catch (e) {
    if (e instanceof Error && e.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }
    if (e instanceof Error && e.message === "INVOICE_SENT") {
      return NextResponse.json(
        {
          error:
            "KolayBi'ye faturası kesilmiş (SENT) sipariş kalıcı silinemez. Önce siparişi iptal edin (fatura iptal edilir + muhasebe bilgilendirilir).",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Sipariş silinemedi." },
      { status: 500 }
    );
  }
}
