import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { hardDeleteOrderTx } from "@/lib/order-delete";

const MAX_IDS = 500;

const bodySchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
});

/**
 * Toplu sipariş KALICI silme (geri alınamaz). Yalnız admin.
 * Her sipariş ayrı transaction'da silinir; biri başarısız olsa bile diğerleri
 * etkilenmez (partial-success raporu). bulk-status deseniyle uyumlu.
 * POST /api/admin/orders/bulk-delete  body: { orderIds: string[] }
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { orderIds } = parsed.data;

  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const orderId of orderIds) {
    try {
      await prisma.$transaction((tx) => hardDeleteOrderTx(tx, orderId));
      succeeded.push(orderId);
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "ORDER_NOT_FOUND"
          ? "Sipariş bulunamadı."
          : e instanceof Error && e.message === "INVOICE_SENT"
            ? "Faturası kesilmiş (SENT) sipariş silinemez — önce iptal edin."
            : e instanceof Error
              ? e.message
              : "Bilinmeyen hata";
      failed.push({ id: orderId, error: msg });
    }
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "ORDER_BULK_DELETE",
    entityType: "order",
    entityId: "bulk",
    metadata: {
      requested: orderIds.length,
      succeeded: succeeded.length,
      failed: failed.length,
      sampleIds: orderIds.slice(0, 20),
    },
  });

  return NextResponse.json({
    succeeded: succeeded.length,
    failed,
    total: orderIds.length,
  });
}
