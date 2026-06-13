import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const patchSchema = z
  .object({
    title: z.string().max(200).nullable().optional(),
    linkUrl: z.string().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(10000).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "Güncellenecek alan yok.",
  });

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Banner bulunamadı." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenZodError(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;

  await prisma.banner.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.displayOrder !== undefined && { displayOrder: data.displayOrder }),
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "BANNER_UPDATE",
    entityType: "banner",
    entityId: id,
    metadata: { changedFields: Object.keys(data) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Banner bulunamadı." }, { status: 404 });
  }

  // Görsel dosyası storage'da kalır (idempotent temizlik dışı tutuldu) — kayıt silinir.
  await prisma.banner.delete({ where: { id } });

  logAudit({
    actorId: gate.session.user.id,
    action: "BANNER_DELETE",
    entityType: "banner",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
