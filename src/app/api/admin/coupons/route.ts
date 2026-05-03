import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { couponCreateSchema, flattenZodError } from "@/lib/validations";

export async function GET() {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = couponCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const existing = await prisma.coupon.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Bu kodla bir kupon zaten var." },
      { status: 409 }
    );
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: parsed.data.code,
      kind: parsed.data.kind,
      value: parsed.data.value,
      minSubtotal: parsed.data.minSubtotal,
      maxUses: parsed.data.maxUses ?? null,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validUntil: parsed.data.validUntil
        ? new Date(parsed.data.validUntil)
        : null,
      isActive: parsed.data.isActive,
    },
  });

  return NextResponse.json({ id: coupon.id });
}
