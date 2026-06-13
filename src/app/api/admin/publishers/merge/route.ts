import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

/**
 * Yayınevi birleştirme: kaynak yayınevi(ler)deki tüm ürünleri hedef yayınevine
 * taşır, kaynaklara ait dealer-iskonto kurallarını siler ve kaynak yayınevlerini
 * siler. Ürün sayıları hedefte birleşir.
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
  const sourceIds = parsed.data.sourceIds.filter((id) => id !== targetId);
  if (sourceIds.length === 0) {
    return NextResponse.json(
      { error: "Birleştirilecek kaynak yayınevi seçilmedi (hedefle aynı olamaz)." },
      { status: 400 }
    );
  }

  const target = await prisma.publisher.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Hedef yayınevi bulunamadi." }, { status: 400 });
  }
  const sources = await prisma.publisher.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true },
  });
  if (sources.length === 0) {
    return NextResponse.json({ error: "Kaynak yayınevi bulunamadi." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const moved = await tx.product.updateMany({
      where: { publisherId: { in: sourceIds } },
      data: { publisherId: targetId },
    });
    const removedDiscounts = await tx.dealerDiscount.deleteMany({
      where: { publisherId: { in: sourceIds } },
    });
    await tx.publisher.deleteMany({ where: { id: { in: sourceIds } } });
    return { moved: moved.count, removedDiscounts: removedDiscounts.count };
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PUBLISHER_MERGE",
    entityType: "publisher",
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
