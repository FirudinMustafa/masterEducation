import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { reviewModerationSchema, flattenZodError } from "@/lib/validations";
import { queueEmail, templateReviewModerated } from "@/lib/email";
import { slugify } from "@/lib/utils";

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
    select: {
      id: true,
      status: true,
      productId: true,
      userId: true,
      product: { select: { name: true, slug: true } },
      user: { select: { email: true, name: true } },
    },
  });

  // E14 — APPROVED/REJECTED durumlarinda yorumu yazana mail.
  // PENDING'e geri donuste mail gondermeyiz.
  if (review.status === "APPROVED" || review.status === "REJECTED") {
    after(() => {
      if (!review.user?.email) return;
      const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
      const slug = review.product.slug || slugify(review.product.name);
      const tpl = templateReviewModerated({
        name: review.user.name ?? "",
        productName: review.product.name,
        status: review.status as "APPROVED" | "REJECTED",
        note: null,
        productUrl: `${base}/urun/${slug}`,
      });
      queueEmail({ ...tpl, to: review.user.email });
    });
  }

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
