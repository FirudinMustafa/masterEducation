import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { deleteUpload } from "@/lib/uploads";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER" || !session.user.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await prisma.dealerDocument.findUnique({ where: { id } });
  if (!doc || doc.dealerId !== session.user.dealerId) {
    return NextResponse.json({ error: "Belge bulunamadi." }, { status: 404 });
  }

  await prisma.dealerDocument.delete({ where: { id } });
  await deleteUpload("dealer-documents", doc.filename);

  logAudit({
    actorId: session.user.id,
    action: "DEALER_DOCUMENT_DELETE",
    entityType: "dealer",
    entityId: doc.dealerId,
    metadata: { kind: doc.kind, filename: doc.filename },
  });

  return NextResponse.json({ ok: true });
}
