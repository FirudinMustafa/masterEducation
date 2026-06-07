import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";

const schema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const images = await prisma.productImage.findMany({
    where: { productId: id },
    select: { id: true },
  });
  const validIds = new Set(images.map((i) => i.id));
  const bad = parsed.data.order.find((id) => !validIds.has(id));
  if (bad) {
    return NextResponse.json(
      { error: `Gorsel bu ürüne ait degil: ${bad}` },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    parsed.data.order.map((imageId, index) =>
      prisma.productImage.update({
        where: { id: imageId },
        data: { displayOrder: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
