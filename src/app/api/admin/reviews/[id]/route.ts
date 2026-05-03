import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { reviewModerationSchema, flattenZodError } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = reviewModerationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const review = await prisma.productReview.update({
    where: { id },
    data: {
      status: parsed.data.status,
      moderatedAt: new Date(),
      moderatedBy: gate.session.user.id,
    },
  });

  return NextResponse.json({ id: review.id, status: review.status });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  await prisma.productReview.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
