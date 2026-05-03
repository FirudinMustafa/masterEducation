import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const bulkSchema = z.object({
  dealerId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        discountPct: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(1000),
});

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bulkSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 },
    );
  }

  const { dealerId, items } = parsed.data;

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  // Geçerli urun ID'lerini dogrula (yanlis/eski ID'leri sessizce eleme, hata don).
  const productIds = items.map((i) => i.productId);
  const found = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  if (found.length !== new Set(productIds).size) {
    const foundSet = new Set(found.map((p) => p.id));
    const missing = productIds.filter((id) => !foundSet.has(id));
    return NextResponse.json(
      {
        error: `Gecersiz urun ID'si: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " ..." : ""}`,
      },
      { status: 400 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    let upserted = 0;
    for (const it of items) {
      const existing = await tx.dealerDiscount.findFirst({
        where: {
          dealerId,
          scope: "PRODUCT",
          productId: it.productId,
          publisherId: null,
          discountGroup: null,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.dealerDiscount.update({
          where: { id: existing.id },
          data: { discountPct: it.discountPct },
        });
      } else {
        await tx.dealerDiscount.create({
          data: {
            dealerId,
            scope: "PRODUCT",
            discountPct: it.discountPct,
            productId: it.productId,
          },
        });
      }
      upserted++;
    }
    return { upserted };
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DISCOUNT_BULK_ASSIGN",
    entityType: "dealer",
    entityId: dealerId,
    metadata: { upserted: result.upserted },
  });

  return NextResponse.json(result);
}
