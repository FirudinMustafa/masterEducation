import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { deleteUpload } from "@/lib/uploads";
import { logAudit } from "@/lib/audit";
import { flattenZodError } from "@/lib/validations";

const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PENDING"]),
  reviewNote: z.string().max(500).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id, docId } = await context.params;
  const doc = await prisma.dealerDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.dealerId !== id) {
    return NextResponse.json({ error: "Belge bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { status, reviewNote } = parsed.data;
  // REJECTED icin not zorunlu olsun (bayinin ne duzeltmesi gerektigini bilsin).
  if (status === "REJECTED" && !reviewNote?.trim()) {
    return NextResponse.json(
      { error: "Red icin aciklama zorunludur." },
      { status: 400 }
    );
  }

  // Faz 19: Doc state machine. APPROVED bir belge sadece PENDING'e döndürülebilir
  // (yeniden inceleme); APPROVED → REJECTED direkt geçişine izin verilmiyor.
  // Admin yanlışlıkla onaylamış olabilir → önce PENDING'e çek, sonra incelesin.
  if (doc.status === "APPROVED" && status === "REJECTED") {
    return NextResponse.json(
      {
        error:
          "Onaylanmis belge dogrudan reddedilemez. Once 'Yeniden Inceleme' (PENDING) yapin, sonra reddedin.",
      },
      { status: 400 }
    );
  }

  const updated = await prisma.dealerDocument.update({
    where: { id: docId },
    data: {
      status,
      reviewNote: reviewNote?.trim() || null,
      reviewedAt: status === "PENDING" ? null : new Date(),
      reviewedBy: status === "PENDING" ? null : gate.session.user.id,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_DOCUMENT_REVIEW",
    entityType: "dealer",
    entityId: id,
    metadata: {
      docId,
      kind: doc.kind,
      from: doc.status,
      to: status,
      note: reviewNote ?? null,
    },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    reviewNote: updated.reviewNote,
    reviewedAt: updated.reviewedAt,
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id, docId } = await context.params;
  const doc = await prisma.dealerDocument.findUnique({ where: { id: docId } });
  if (!doc || doc.dealerId !== id) {
    return NextResponse.json({ error: "Belge bulunamadi." }, { status: 404 });
  }

  await prisma.dealerDocument.delete({ where: { id: docId } });
  await deleteUpload("dealer-documents", doc.filename);

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_DOCUMENT_DELETE",
    entityType: "dealer",
    entityId: id,
    metadata: { kind: doc.kind, filename: doc.filename, source: "admin" },
  });

  return NextResponse.json({ ok: true });
}
