import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

/**
 * Kategori birleştirme: kaynak kategori(ler)deki tüm ürünleri hedef kategoriye
 * taşır, kaynakların dealer-iskonto kurallarını siler (unique kısıt çakışmasını
 * önlemek için — hedefin kuralları geçerli kalır) ve kaynak kategorileri siler.
 * Örn. ELE → MEB: ELE'deki ürünler MEB'e geçer, sayılar birleşir.
 */
const bodySchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(200),
  targetId: z.string().min(1),
});

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
  const { targetId } = parsed.data;
  // Hedef kaynak listesinde olamaz (kendine birleştirme).
  const sourceIds = parsed.data.sourceIds.filter((id) => id !== targetId);
  if (sourceIds.length === 0) {
    return NextResponse.json(
      { error: "Birleştirilecek kaynak kategori seçilmedi (hedefle aynı olamaz)." },
      { status: 400 }
    );
  }

  const target = await prisma.category.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Hedef kategori bulunamadi." }, { status: 400 });
  }
  const sources = await prisma.category.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true },
  });
  if (sources.length === 0) {
    return NextResponse.json({ error: "Kaynak kategori bulunamadi." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const moved = await tx.product.updateMany({
      where: { categoryId: { in: sourceIds } },
      data: { categoryId: targetId },
    });
    const removedDiscounts = await tx.dealerDiscount.deleteMany({
      where: { categoryId: { in: sourceIds } },
    });
    await tx.category.deleteMany({ where: { id: { in: sourceIds } } });
    return { moved: moved.count, removedDiscounts: removedDiscounts.count };
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "CATEGORY_MERGE",
    entityType: "category",
    entityId: targetId,
    metadata: {
      targetName: target.name,
      sourceIds,
      sourceNames: sources.map((s) => s.name),
      movedProducts: result.moved,
      removedDiscounts: result.removedDiscounts,
    },
  });

  return NextResponse.json({
    ok: true,
    movedProducts: result.moved,
    mergedCount: sources.length,
    removedDiscounts: result.removedDiscounts,
    targetName: target.name,
  });
}
