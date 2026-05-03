import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; imageId: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id, imageId } = await context.params;
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== id) {
    return NextResponse.json({ error: "Gorsel bulunamadi." }, { status: 404 });
  }

  await prisma.productImage.delete({ where: { id: imageId } });

  const remaining = await prisma.productImage.count({ where: { productId: id } });
  if (remaining === 0) {
    await prisma.product.update({
      where: { id },
      data: { hasImage: false },
    });
  }

  // Note: file stays on disk — orphan cleanup is a future maintenance job.
  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_IMAGE_DELETE",
    entityType: "product",
    entityId: id,
    metadata: { imageId, filename: image.filename },
  });

  return NextResponse.json({ ok: true });
}
