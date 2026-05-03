import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { dealerStatusUpdateSchema, flattenZodError } from "@/lib/validations";
import { queueEmail, templateDealerApproved } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = dealerStatusUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  // Onayda paymentTerms degisikligi de uygulanabilir; PREPAID'da limit sifirlanir.
  const nextPaymentTerms = parsed.data.paymentTerms ?? dealer.paymentTerms;
  const incomingLimit = parsed.data.creditLimit ?? dealer.creditLimit;
  const finalLimit = nextPaymentTerms === "PREPAID" ? 0 : incomingLimit;

  const updated = await prisma.dealer.update({
    where: { id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedBy: gate.session.user.id,
      paymentTerms: nextPaymentTerms,
      creditLimit: finalLimit,
      notes: parsed.data.notes ?? dealer.notes,
      rejectionReason: null,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_APPROVE",
    entityType: "dealer",
    entityId: updated.id,
    metadata: {
      creditLimit: Number(updated.creditLimit),
      paymentTerms: updated.paymentTerms,
    },
  });

  after(() => {
    const tpl = templateDealerApproved(dealer.companyName);
    queueEmail({ ...tpl, to: dealer.user.email });
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
