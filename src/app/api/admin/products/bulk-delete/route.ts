import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const MAX_IDS = 500;

const bodySchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
});

/**
 * Toplu ürün silme — sipariş referansi olan ürünler "soft" (isPublished=false,
 * stok=0), olmayan ürünler "hard" (cascade) silinir. Tek tek DELETE endpoint'i
 * ile ayni mantik, transaction icinde uygulanir.
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
  const { productIds } = parsed.data;

  // Hangi ID'ler sipariş referansi taşıyor — tek query
  const orderRefs = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _count: { _all: true },
  });
  const refSet = new Set(orderRefs.map((r) => r.productId));

  const softIds = productIds.filter((id) => refSet.has(id));
  const hardIds = productIds.filter((id) => !refSet.has(id));

  await prisma.$transaction(async (tx) => {
    if (softIds.length > 0) {
      await tx.product.updateMany({
        where: { id: { in: softIds } },
        data: { isPublished: false, stockQuantity: 0 },
      });
    }
    if (hardIds.length > 0) {
      await tx.dealerDiscount.deleteMany({
        where: { productId: { in: hardIds } },
      });
      await tx.cartItem.deleteMany({ where: { productId: { in: hardIds } } });
      await tx.productImage.deleteMany({
        where: { productId: { in: hardIds } },
      });
      await tx.product.deleteMany({ where: { id: { in: hardIds } } });
    }
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_BULK_DELETE",
    entityType: "product",
    entityId: "bulk",
    metadata: {
      hardDeleted: hardIds.length,
      softDeleted: softIds.length,
      sampleIds: productIds.slice(0, 20),
    },
  });

  return NextResponse.json({
    hardDeleted: hardIds.length,
    softDeleted: softIds.length,
  });
}
