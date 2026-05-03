import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { cleanupDealerByUserId } from "@/lib/dealer-cleanup";

const dealerEditSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  taxOffice: z.string().min(2).max(100).optional(),
  taxNumber: z.string().regex(/^\d{10,11}$/).optional(),
  tradeRegNo: z.string().max(50).nullable().optional(),
  contactPerson: z.string().max(100).nullable().optional(),
  creditLimit: z.number().min(0).max(9_999_999).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  paymentTerms: z.enum(["OPEN_ACCOUNT", "PREPAID"]).optional(),
}).refine(
  (v) => !(v.paymentTerms === "PREPAID" && (v.creditLimit ?? 0) > 0),
  { message: "PREPAID modunda kredi limiti 0 olmalidir.", path: ["creditLimit"] }
);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = dealerEditSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const dealer = await prisma.dealer.findUnique({ where: { id } });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  // PREPAID'a gecisle birlikte kredi limiti sifirlanir (admin tutarsiz gondermisse de
  // burada koruma var; UI da paymentTerms degisince inputu sifirliyor).
  const nextPaymentTerms = parsed.data.paymentTerms ?? dealer.paymentTerms;
  const incomingLimit =
    parsed.data.creditLimit === undefined
      ? dealer.creditLimit
      : (parsed.data.creditLimit ?? dealer.creditLimit);
  const finalLimit = nextPaymentTerms === "PREPAID" ? 0 : incomingLimit;

  const updated = await prisma.dealer.update({
    where: { id },
    data: {
      companyName: parsed.data.companyName ?? dealer.companyName,
      taxOffice: parsed.data.taxOffice ?? dealer.taxOffice,
      taxNumber: parsed.data.taxNumber ?? dealer.taxNumber,
      tradeRegNo:
        parsed.data.tradeRegNo === undefined ? dealer.tradeRegNo : parsed.data.tradeRegNo,
      contactPerson:
        parsed.data.contactPerson === undefined ? dealer.contactPerson : parsed.data.contactPerson,
      creditLimit: finalLimit,
      paymentTerms: nextPaymentTerms,
      notes: parsed.data.notes === undefined ? dealer.notes : parsed.data.notes,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_UPDATE",
    entityType: "dealer",
    entityId: updated.id,
    metadata: {
      creditLimit: Number(updated.creditLimit),
      paymentTerms: updated.paymentTerms,
      paymentTermsChanged: dealer.paymentTerms !== updated.paymentTerms,
      companyChanged: dealer.companyName !== updated.companyName,
    },
  });

  return NextResponse.json({
    id: updated.id,
    companyName: updated.companyName,
    taxOffice: updated.taxOffice,
    taxNumber: updated.taxNumber,
    creditLimit: updated.creditLimit,
    paymentTerms: updated.paymentTerms,
    notes: updated.notes,
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const dealer = await prisma.dealer.findUnique({
    where: { id },
    select: { id: true, userId: true, companyName: true },
  });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  // Cleanup: aktif siparisleri iptal eder, stok geri yukler, ledger temizler,
  // dealer'i siler. User KORUNUR. Detay: src/lib/dealer-cleanup.ts
  const result = await prisma.$transaction(async (tx) => {
    const cleanup = await cleanupDealerByUserId(dealer.userId, gate.session.user.id, tx);
    // User'in rolunu CUSTOMER'a dusur (artik bayi degil)
    await tx.user.update({
      where: { id: dealer.userId },
      data: { role: "CUSTOMER" },
    });
    return cleanup;
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_UPDATE",
    entityType: "dealer",
    entityId: id,
    metadata: { deleted: true, companyName: dealer.companyName, ...(result ?? {}) },
  });

  return NextResponse.json({ ok: true, ...(result ?? {}) });
}
