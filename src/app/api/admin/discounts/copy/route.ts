import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  fromDealerId: z.string().min(1),
  toDealerId: z.string().min(1),
  replace: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 },
    );
  }

  const { fromDealerId, toDealerId, replace } = parsed.data;
  if (fromDealerId === toDealerId) {
    return NextResponse.json(
      { error: "Kaynak ve hedef bayi ayni olamaz." },
      { status: 400 },
    );
  }

  const [fromDealer, toDealer, sourceRules] = await Promise.all([
    prisma.dealer.findUnique({
      where: { id: fromDealerId },
      select: { id: true, companyName: true },
    }),
    prisma.dealer.findUnique({
      where: { id: toDealerId },
      select: { id: true, companyName: true },
    }),
    prisma.dealerDiscount.findMany({
      where: { dealerId: fromDealerId },
      select: {
        scope: true,
        discountPct: true,
        productId: true,
        categoryId: true,
        publisherId: true,
        discountGroup: true,
      },
    }),
  ]);

  if (!fromDealer || !toDealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }
  if (sourceRules.length === 0) {
    return NextResponse.json(
      { error: "Kaynak bayinin kopyalanacak kurali yok." },
      { status: 400 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    if (replace) {
      await tx.dealerDiscount.deleteMany({ where: { dealerId: toDealerId } });
    }
    let copied = 0;
    for (const r of sourceRules) {
      const existing = await tx.dealerDiscount.findFirst({
        where: {
          dealerId: toDealerId,
          scope: r.scope,
          productId: r.productId,
          publisherId: r.publisherId,
          discountGroup: r.discountGroup,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.dealerDiscount.update({
          where: { id: existing.id },
          data: { discountPct: r.discountPct },
        });
      } else {
        await tx.dealerDiscount.create({
          data: {
            dealerId: toDealerId,
            scope: r.scope,
            discountPct: r.discountPct,
            productId: r.productId,
            publisherId: r.publisherId,
            discountGroup: r.discountGroup,
          },
        });
      }
      copied++;
    }
    return { copied };
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DISCOUNT_COPY",
    entityType: "dealer",
    entityId: toDealerId,
    metadata: {
      from: fromDealerId,
      fromName: fromDealer.companyName,
      copied: result.copied,
      replaced: !!replace,
    },
  });

  return NextResponse.json(result);
}
