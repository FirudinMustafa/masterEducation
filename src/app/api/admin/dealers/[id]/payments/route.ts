import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { dealerPaymentSchema, flattenZodError } from "@/lib/validations";
import { writeLedgerEntry } from "@/lib/ledger";
import { logAudit } from "@/lib/audit";
import { queueEmail, templateDealerLedgerEntry } from "@/lib/email";

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
  const parsed = dealerPaymentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { amount, reference, note } = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    return writeLedgerEntry(tx, {
      dealerId: id,
      kind: "PAYMENT_CREDIT",
      amount: -amount,
      reference,
      note: note ?? "Tahsilat",
      createdBy: gate.session.user.id,
    });
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_PAYMENT",
    entityType: "dealer",
    entityId: id,
    metadata: {
      amount,
      reference: reference ?? null,
      balanceAfter: result.balanceAfter,
    },
  });

  // E13 — Bayiye tahsilat bildirim maili.
  after(async () => {
    const owner = await prisma.user
      .findUnique({
        where: { id: dealer.userId },
        select: { email: true },
      })
      .catch(() => null);
    if (!owner?.email) return;
    const tpl = templateDealerLedgerEntry({
      companyName: dealer.companyName,
      kind: "PAYMENT",
      amount: -amount,
      note: note ?? null,
      newBalance: result.balanceAfter,
    });
    queueEmail({ ...tpl, to: owner.email });
  });

  return NextResponse.json({
    entryId: result.entryId,
    balanceAfter: result.balanceAfter,
  });
}
