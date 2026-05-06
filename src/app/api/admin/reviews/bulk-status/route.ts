import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { queueEmail, templateReviewModerated } from "@/lib/email";
import { slugify } from "@/lib/utils";

const MAX_IDS = 500;

const bodySchema = z
  .object({
    reviewIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
    action: z.enum(["APPROVED", "REJECTED", "DELETE"]),
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
  const { reviewIds, action } = parsed.data;

  let result: { count: number };
  // E14 — APPROVED/REJECTED toplu modere edilen yorumlarin yazarlarina mail
  // gonderilir; bunun icin update'ten ONCE etkilenecek satirlari tasiyoruz.
  let mailables: Array<{
    userEmail: string;
    userName: string;
    productName: string;
    productSlug: string;
  }> = [];
  if (action === "DELETE") {
    result = await prisma.productReview.deleteMany({
      where: { id: { in: reviewIds } },
    });
  } else {
    const targets = await prisma.productReview.findMany({
      where: { id: { in: reviewIds } },
      select: {
        product: { select: { name: true, slug: true } },
        user: { select: { email: true, name: true } },
      },
    });
    mailables = targets
      .filter((t) => t.user?.email)
      .map((t) => ({
        userEmail: t.user!.email,
        userName: t.user!.name ?? "",
        productName: t.product.name,
        productSlug: t.product.slug || slugify(t.product.name),
      }));
    result = await prisma.productReview.updateMany({
      where: { id: { in: reviewIds } },
      data: {
        status: action,
        moderatedAt: new Date(),
        moderatedBy: gate.session.user.id,
      },
    });
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "REVIEW_BULK_STATUS",
    entityType: "review",
    entityId: "bulk",
    metadata: {
      requested: reviewIds.length,
      affected: result.count,
      action,
      sampleIds: reviewIds.slice(0, 20),
    },
  });

  if (mailables.length > 0 && (action === "APPROVED" || action === "REJECTED")) {
    after(() => {
      const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
      for (const m of mailables) {
        const tpl = templateReviewModerated({
          name: m.userName,
          productName: m.productName,
          status: action,
          note: null,
          productUrl: `${base}/urun/${m.productSlug}`,
        });
        queueEmail({ ...tpl, to: m.userEmail });
      }
    });
  }

  return NextResponse.json({ affected: result.count, action });
}
