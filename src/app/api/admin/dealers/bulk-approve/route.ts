import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { queueEmail, templateDealerApproved } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const MAX_IDS = 200;

const bodySchema = z
  .object({
    dealerIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
    paymentTerms: z.enum(["OPEN_ACCOUNT", "PREPAID"]),
    creditLimit: z.number().min(0).max(20_000_000).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (v) => !(v.paymentTerms === "PREPAID" && (v.creditLimit ?? 0) > 0),
    { message: "PREPAID modunda kredi limiti 0 olmalidir.", path: ["creditLimit"] }
  );

/**
 * Toplu bayi onaylama. Yalnızca PENDING durumdaki bayilere uygulanır
 * (zaten APPROVED/REJECTED/SUSPENDED olanlar silently atlanır).
 *
 * Tüm secili bayilere aynı paymentTerms + creditLimit + notes uygulanır.
 * Email queue (after) her başarılı onay için tetiklenir.
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
  const { dealerIds, paymentTerms, creditLimit, notes } = parsed.data;
  const finalLimit = paymentTerms === "PREPAID" ? 0 : (creditLimit ?? 0);

  const dealers = await prisma.dealer.findMany({
    where: { id: { in: dealerIds } },
    select: {
      id: true,
      status: true,
      companyName: true,
      user: { select: { email: true } },
    },
  });

  const eligible = dealers.filter((d) => d.status === "PENDING");
  if (eligible.length === 0) {
    return NextResponse.json({
      approved: 0,
      skipped: dealers.length,
      message: "Onaylanacak (PENDING durumda) bayi yok.",
    });
  }

  const now = new Date();
  const result = await prisma.dealer.updateMany({
    where: { id: { in: eligible.map((d) => d.id) } },
    data: {
      status: "APPROVED",
      approvedAt: now,
      approvedBy: gate.session.user.id,
      paymentTerms,
      creditLimit: finalLimit,
      notes: notes ?? undefined,
      rejectionReason: null,
    },
  });

  // Email cascade
  after(() => {
    for (const d of eligible) {
      const tpl = templateDealerApproved(d.companyName);
      queueEmail({ ...tpl, to: d.user.email });
    }
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_BULK_APPROVE",
    entityType: "dealer",
    entityId: "bulk",
    metadata: {
      requested: dealerIds.length,
      approved: result.count,
      skipped: dealerIds.length - result.count,
      paymentTerms,
      creditLimit: finalLimit,
      sampleIds: eligible.slice(0, 20).map((d) => d.id),
    },
  });

  return NextResponse.json({
    approved: result.count,
    skipped: dealers.length - result.count,
    notFound: dealerIds.length - dealers.length,
  });
}
