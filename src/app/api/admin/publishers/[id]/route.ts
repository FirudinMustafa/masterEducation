import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { publisherUpdateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.publisher.findUnique({ where: { slug } });
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
  const existing = await prisma.publisher.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Yayınevi bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = publisherUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  let slug = existing.slug;
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const nameConflict = await prisma.publisher.findUnique({
      where: { name: parsed.data.name },
    });
    if (nameConflict && nameConflict.id !== id) {
      return NextResponse.json(
        { error: "Bu adla bir yayınevi zaten var." },
        { status: 409 }
      );
    }
    const base = slugify(parsed.data.name);
    if (!base) {
      return NextResponse.json(
        { error: "Yayınevi adi gecerli bir slug uretmedi." },
        { status: 400 }
      );
    }
    slug = await uniqueSlug(base, id);
  }

  const updated = await prisma.publisher.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name, slug }),
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PUBLISHER_UPDATE",
    entityType: "publisher",
    entityId: updated.id,
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

  const [productCount, discountCount] = await Promise.all([
    prisma.product.count({ where: { publisherId: id } }),
    prisma.dealerDiscount.count({ where: { publisherId: id } }),
  ]);

  if ((productCount > 0 || discountCount > 0) && !force) {
    return NextResponse.json(
      {
        error:
          productCount > 0
            ? `Bu yayınevinin ${productCount} ürünu var. Baska yayınevine tasiyin veya ?force=1 ile iliskisini kirarak silin.`
            : `Bu yayınevine bagli ${discountCount} iskonto kurali var. Kurallari silin veya ?force=1 kullanin.`,
        productCount,
        discountCount,
      },
      { status: 409 }
    );
  }

  // Force delete: ürünlerin publisherId'sini null yap, iskonto kurallarini sil,
  // yayınevini sil.
  await prisma.$transaction([
    ...(productCount > 0
      ? [
          prisma.product.updateMany({
            where: { publisherId: id },
            data: { publisherId: null },
          }),
        ]
      : []),
    ...(discountCount > 0
      ? [prisma.dealerDiscount.deleteMany({ where: { publisherId: id } })]
      : []),
    prisma.publisher.delete({ where: { id } }),
  ]);

  logAudit({
    actorId: gate.session.user.id,
    action: "PUBLISHER_DELETE",
    entityType: "publisher",
    entityId: id,
    metadata: { force, detachedProducts: productCount, removedDiscounts: discountCount },
  });

  return NextResponse.json({ ok: true, detachedProducts: productCount, removedDiscounts: discountCount });
}
