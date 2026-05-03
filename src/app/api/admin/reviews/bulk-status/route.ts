import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

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
  if (action === "DELETE") {
    result = await prisma.productReview.deleteMany({
      where: { id: { in: reviewIds } },
    });
  } else {
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

  return NextResponse.json({ affected: result.count, action });
}
