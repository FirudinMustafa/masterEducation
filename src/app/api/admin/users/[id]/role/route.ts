import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { userRoleUpdateSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  // Don't let an admin demote themselves — locks out the last admin otherwise.
  if (id === gate.session.user.id) {
    return NextResponse.json(
      { error: "Kendi rolunuzu degistiremezsiniz." },
      { status: 400 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = userRoleUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: { dealer: { select: { id: true } } },
  });
  if (!user) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }

  if (user.role === "ADMIN" && parsed.data.role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Son admin rolunu degistiremezsiniz." },
        { status: 400 }
      );
    }
  }

  // Moving away from DEALER is OK; the Dealer record stays for history.
  // Moving INTO DEALER without a Dealer record is rejected — dealers must apply.
  if (parsed.data.role === "DEALER" && !user.dealer) {
    return NextResponse.json(
      {
        error:
          "Bu kullanici bayi olarak kaydolmamis. Once bayi basvurusu yapmali.",
      },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role: parsed.data.role },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "USER_ROLE_CHANGE",
    entityType: "user",
    entityId: updated.id,
    metadata: { from: user.role, to: parsed.data.role },
  });

  return NextResponse.json({ id: updated.id, role: updated.role });
}
