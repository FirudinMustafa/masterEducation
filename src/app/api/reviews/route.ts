import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { reviewCreateSchema, flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yorum yazmak icin giris yapin." }, {
      status: 401,
    });
  }

  // Spam koruma: kullanici basina saatte 10 yorum.
  const rl = rateLimit(`review:${session.user.id}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Cok sik yorum gonderimi. Bir saat sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = reviewCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, isPublished: true },
  });
  if (!product || !product.isPublished) {
    return NextResponse.json({ error: "Urun bulunamadi." }, { status: 404 });
  }

  // Reject duplicate review by same user for the same product (unique constraint
  // would throw anyway but we want a friendly message).
  const existing = await prisma.productReview.findUnique({
    where: {
      productId_userId: {
        productId: parsed.data.productId,
        userId: session.user.id,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Bu urun icin yorumunuz zaten kayitli." },
      { status: 409 }
    );
  }

  // Yorumlar dogrudan yayinlanir. Admin /admin/yorumlar uzerinden
  // uygunsuz yorumu silebilir (yeni akisin 'sil' butonuyla).
  const review = await prisma.productReview.create({
    data: {
      productId: parsed.data.productId,
      userId: session.user.id,
      rating: parsed.data.rating,
      title: parsed.data.title,
      comment: parsed.data.comment,
      status: "APPROVED",
      moderatedAt: new Date(),
    },
  });

  logAudit({
    actorId: session.user.id,
    action: "REVIEW_CREATE",
    entityType: "product",
    entityId: parsed.data.productId,
    metadata: { rating: parsed.data.rating, reviewId: review.id },
  });

  return NextResponse.json({
    id: review.id,
    status: review.status,
    message: "Yorumunuz yayinlandi.",
  });
}
