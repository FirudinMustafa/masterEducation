import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { reviewUpdateSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

async function loadOwnReview(reviewId: string, userId: string) {
  const review = await prisma.productReview.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true, productId: true },
  });
  if (!review || review.userId !== userId) return null;
  return review;
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const review = await loadOwnReview(id, session.user.id);
  if (!review) {
    return NextResponse.json({ error: "Yorum bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = reviewUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  // Musteri yorumunu duzenleyince tekrar APPROVED — otomatik yayin modelimiz
  // bu; admin gerekirse /admin/yorumlar'dan yine kaldirabilir.
  const updated = await prisma.productReview.update({
    where: { id },
    data: {
      rating: parsed.data.rating,
      title: parsed.data.title,
      comment: parsed.data.comment,
      status: "APPROVED",
      moderatedAt: new Date(),
    },
  });

  logAudit({
    actorId: session.user.id,
    action: "REVIEW_UPDATE",
    entityType: "product",
    entityId: review.productId,
    metadata: { reviewId: id, rating: parsed.data.rating },
  });

  return NextResponse.json({ id: updated.id, message: "Yorumunuz guncellendi." });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const review = await loadOwnReview(id, session.user.id);
  if (!review) {
    return NextResponse.json({ error: "Yorum bulunamadi." }, { status: 404 });
  }

  await prisma.productReview.delete({ where: { id } });

  logAudit({
    actorId: session.user.id,
    action: "REVIEW_DELETE",
    entityType: "product",
    entityId: review.productId,
    metadata: { reviewId: id },
  });

  return NextResponse.json({ message: "Yorum silindi." });
}
