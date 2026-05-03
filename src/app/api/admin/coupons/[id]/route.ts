import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { couponUpdateSchema, flattenZodError } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Kupon bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = couponUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const updated = await prisma.coupon.update({
    where: { id },
    data: {
      ...(data.code !== undefined && { code: data.code }),
      ...(data.kind !== undefined && { kind: data.kind }),
      ...(data.value !== undefined && { value: data.value }),
      ...(data.minSubtotal !== undefined && { minSubtotal: data.minSubtotal }),
      ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
      ...(data.validFrom !== undefined && {
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
      }),
      ...(data.validUntil !== undefined && {
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });

  return NextResponse.json({ id: updated.id });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) {
    return NextResponse.json({ error: "Kupon bulunamadi." }, { status: 404 });
  }

  const redemptionCount = await prisma.couponRedemption.count({
    where: { couponId: id },
  });
  if (redemptionCount > 0) {
    // Keep the row for order history; just deactivate.
    await prisma.coupon.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true, mode: "deactivated" });
  }

  await prisma.coupon.delete({ where: { id } });
  return NextResponse.json({ ok: true, mode: "deleted" });
}
