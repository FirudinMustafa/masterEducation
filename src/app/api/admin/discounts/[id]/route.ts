import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const existing = await prisma.dealerDiscount.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Kural bulunamadi." }, { status: 404 });
  }
  await prisma.dealerDiscount.delete({ where: { id } });

  logAudit({
    actorId: gate.session.user.id,
    action: "DISCOUNT_DELETE",
    entityType: "discount",
    entityId: id,
    metadata: {
      dealerId: existing.dealerId,
      scope: existing.scope,
    },
  });

  return NextResponse.json({ ok: true });
}
