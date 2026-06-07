import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { discountRuleSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const dealerId = req.nextUrl.searchParams.get("dealerId");
  const rules = await prisma.dealerDiscount.findMany({
    where: dealerId ? { dealerId } : undefined,
    include: {
      dealer: { select: { companyName: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = discountRuleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { dealerId, scope, discountPct, productId, categoryId, publisherId, discountGroup } =
    parsed.data;

  if (scope === "PRODUCT" && !productId) {
    return NextResponse.json(
      { error: "PRODUCT kapsami icin ürün secilmeli." },
      { status: 400 }
    );
  }
  if (scope === "CATEGORY" && !categoryId) {
    return NextResponse.json(
      { error: "CATEGORY kapsami icin kategori secilmeli." },
      { status: 400 }
    );
  }
  if (scope === "PUBLISHER" && !publisherId) {
    return NextResponse.json(
      { error: "PUBLISHER kapsami icin yayınevi secilmeli." },
      { status: 400 }
    );
  }
  if (scope === "DISCOUNT_GROUP" && !discountGroup) {
    return NextResponse.json(
      { error: "DISCOUNT_GROUP kapsami icin grup girilmeli." },
      { status: 400 }
    );
  }

  const existing = await prisma.dealerDiscount.findFirst({
    where: {
      dealerId,
      scope,
      productId: productId ?? null,
      categoryId: categoryId ?? null,
      publisherId: publisherId ?? null,
      discountGroup: discountGroup ?? null,
    },
    select: { id: true },
  });

  const rule = existing
    ? await prisma.dealerDiscount.update({
        where: { id: existing.id },
        data: { discountPct },
      })
    : await prisma.dealerDiscount.create({
        data: {
          dealerId,
          scope,
          discountPct,
          productId: productId ?? null,
          categoryId: categoryId ?? null,
          publisherId: publisherId ?? null,
          discountGroup: discountGroup ?? null,
        },
      });

  logAudit({
    actorId: gate.session.user.id,
    action: existing ? "DISCOUNT_UPDATE" : "DISCOUNT_CREATE",
    entityType: "discount",
    entityId: rule.id,
    metadata: {
      dealerId,
      scope,
      discountPct,
      productId: productId ?? null,
      categoryId: categoryId ?? null,
      publisherId: publisherId ?? null,
      discountGroup: discountGroup ?? null,
    },
  });

  return NextResponse.json({ id: rule.id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const ids: unknown = (json as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === "string")) {
    return NextResponse.json(
      { error: "Silinecek ids[] gerekli." },
      { status: 400 },
    );
  }
  const result = await prisma.dealerDiscount.deleteMany({
    where: { id: { in: ids as string[] } },
  });
  logAudit({
    actorId: gate.session.user.id,
    action: "DISCOUNT_DELETE",
    entityType: "discount",
    entityId: "bulk",
    metadata: { count: result.count, ids: (ids as string[]).slice(0, 50) },
  });
  return NextResponse.json({ deleted: result.count });
}
