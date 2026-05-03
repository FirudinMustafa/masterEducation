import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { dealerAdjustmentSchema, flattenZodError } from "@/lib/validations";
import { writeLedgerEntry } from "@/lib/ledger";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const dealer = await prisma.dealer.findUnique({ where: { id } });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = dealerAdjustmentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { amount, note } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    return writeLedgerEntry(tx, {
      dealerId: id,
      kind: "MANUAL_ADJUSTMENT",
      amount,
      note,
      createdBy: gate.session.user.id,
    });
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_ADJUSTMENT",
    entityType: "dealer",
    entityId: id,
    metadata: { amount, balanceAfter: result.balanceAfter, note },
  });

  return NextResponse.json({
    entryId: result.entryId,
    balanceAfter: result.balanceAfter,
  });
}
