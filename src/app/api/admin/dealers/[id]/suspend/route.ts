import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { dealerStatusUpdateSchema, flattenZodError } from "@/lib/validations";
import { queueEmail, templateDealerSuspended } from "@/lib/email";
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

  const updated = await prisma.dealer.update({
    where: { id },
    data: {
      status: "SUSPENDED",
      notes: parsed.data.notes ?? dealer.notes,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_SUSPEND",
    entityType: "dealer",
    entityId: updated.id,
    metadata: { notes: parsed.data.notes ?? null },
  });

  after(() => {
    const tpl = templateDealerSuspended(
      dealer.companyName,
      parsed.data.notes ?? null
    );
    queueEmail({ ...tpl, to: dealer.user.email });
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
