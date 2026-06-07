import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { categoryUpdateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
    i++;
    if (i > 500) throw new Error("slug-collision");
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Kategori bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = categoryUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  let slug = existing.slug;
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const base = slugify(parsed.data.name);
    if (!base) {
      return NextResponse.json(
        { error: "Kategori adi gecerli bir slug uretmedi." },
        { status: 400 }
      );
    }
    slug = await uniqueSlug(base, id);
  }

  const updated = await prisma.category.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name, slug }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "CATEGORY_UPDATE",
    entityType: "category",
    entityId: updated.id,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ id: updated.id, slug: updated.slug });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const force = req.nextUrl.searchParams.get("force") === "1";

  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0 && !force) {
    return NextResponse.json(
      {
        error: `Bu kategoride ${productCount} ürün var. Ürünleri baska kategoriye tasiyin veya ?force=1 ile iliskisini kirarak silin.`,
        productCount,
      },
      { status: 409 }
    );
  }

  // Force delete: iliskili ürünlerin categoryId'sini null yap, sonra kategoriyi sil.
  await prisma.$transaction([
    ...(productCount > 0
      ? [
          prisma.product.updateMany({
            where: { categoryId: id },
            data: { categoryId: null },
          }),
        ]
      : []),
    prisma.category.delete({ where: { id } }),
  ]);

  logAudit({
    actorId: gate.session.user.id,
    action: "CATEGORY_DELETE",
    entityType: "category",
    entityId: id,
    metadata: { force, detachedProducts: productCount },
  });

  return NextResponse.json({ ok: true, detachedProducts: productCount });
}
