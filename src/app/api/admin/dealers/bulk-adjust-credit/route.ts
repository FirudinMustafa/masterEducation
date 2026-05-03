import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const MAX_IDS = 500;

const bodySchema = z.object({
  dealerIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
  mode: z.enum(["set", "percent_increase", "percent_decrease", "fixed_increase", "fixed_decrease"]),
  value: z.number().min(0).max(9_999_999),
  minLimit: z.number().min(0).optional(),
  dryRun: z.boolean().optional().default(false),
});

function applyMode(
  current: number,
  mode: z.infer<typeof bodySchema>["mode"],
  value: number,
  minLimit: number | undefined
): number {
  let next: number;
  switch (mode) {
    case "set":
      next = value;
      break;
    case "percent_increase":
      next = current * (1 + value / 100);
      break;
    case "percent_decrease":
      next = current * (1 - value / 100);
      break;
    case "fixed_increase":
      next = current + value;
      break;
    case "fixed_decrease":
      next = current - value;
      break;
  }
  next = Math.round(next * 100) / 100;
  if (minLimit !== undefined && next < minLimit) next = minLimit;
  if (next < 0) next = 0;
  return next;
}

/**
 * Toplu bayi kredi limiti ayarlama. 5 mod (set / %± / sabit±).
 * Sadece OPEN_ACCOUNT bayilere uygulanır (PREPAID için limit anlamsız).
 * Sadece APPROVED bayiler güncellenir.
 */
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
  const { dealerIds, mode, value, minLimit, dryRun } = parsed.data;

  const dealers = await prisma.dealer.findMany({
    where: {
      id: { in: dealerIds },
      status: "APPROVED",
      paymentTerms: "OPEN_ACCOUNT",
    },
    select: {
      id: true,
      companyName: true,
      creditLimit: true,
    },
  });

  if (dealers.length === 0) {
    return NextResponse.json({
      affected: 0,
      sample: [],
      applied: false,
      message: "OPEN_ACCOUNT modunda APPROVED bayi yok.",
    });
  }

  const updates = dealers.map((d) => {
    const current = Number(d.creditLimit);
    const next = applyMode(current, mode, value, minLimit);
    return { id: d.id, name: d.companyName, current, next };
  });

  const sample = updates.slice(0, 20);

  if (dryRun) {
    return NextResponse.json({
      affected: updates.length,
      sample,
      applied: false,
    });
  }

  // Bucket by next-limit → batch updateMany (ayni yeni limit'e gidenleri grupla)
  const buckets = new Map<number, string[]>();
  for (const u of updates) {
    const arr = buckets.get(u.next) ?? [];
    arr.push(u.id);
    buckets.set(u.next, arr);
  }
  await prisma.$transaction(
    Array.from(buckets.entries()).map(([nextLimit, ids]) =>
      prisma.dealer.updateMany({
        where: { id: { in: ids } },
        data: { creditLimit: nextLimit },
      })
    )
  );

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_BULK_CREDIT_ADJUST",
    entityType: "dealer",
    entityId: "bulk",
    metadata: {
      affected: updates.length,
      mode,
      value,
      minLimit,
      sampleIds: updates.slice(0, 20).map((u) => u.id),
    },
  });

  return NextResponse.json({
    affected: updates.length,
    sample,
    applied: true,
  });
}
