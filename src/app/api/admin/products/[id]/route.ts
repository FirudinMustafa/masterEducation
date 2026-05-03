import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { productUpdateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string, excludeId: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
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
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Urun bulunamadi." }, { status: 404 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = productUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Re-slugify if name changed.
  let slug = existing.slug;
  if (data.name && data.name !== existing.name) {
    const base = slugify(data.name);
    if (!base) {
      return NextResponse.json(
        { error: "Urun adi slug olusturmak icin uygun degil." },
        { status: 400 }
      );
    }
    slug = await uniqueSlug(base, id);
  }

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name, slug }),
      ...(data.nameEn !== undefined && { nameEn: data.nameEn }),
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.oldPrice !== undefined && { oldPrice: data.oldPrice }),
      ...(data.vatRate !== undefined && { vatRate: data.vatRate }),
      ...(data.stockQuantity !== undefined && {
        stockQuantity: data.stockQuantity,
      }),
      ...(data.publisherId !== undefined && { publisherId: data.publisherId }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.anaTur !== undefined && { anaTur: data.anaTur }),
      ...(data.detayTur !== undefined && { detayTur: data.detayTur }),
      ...(data.language !== undefined && { language: data.language }),
      ...(data.productType !== undefined && { productType: data.productType }),
      ...(data.discountGroup !== undefined && {
        discountGroup: data.discountGroup,
      }),
      ...(data.authorCode !== undefined && { authorCode: data.authorCode }),
      ...(data.isPublished !== undefined && { isPublished: data.isPublished }),
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_UPDATE",
    entityType: "product",
    entityId: updated.id,
    metadata: {
      changedFields: Object.keys(data),
    },
  });

  return NextResponse.json({ id: updated.id, slug: updated.slug });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: "Urun bulunamadi." }, { status: 404 });
  }

  const orderItemCount = await prisma.orderItem.count({
    where: { productId: id },
  });

  if (orderItemCount > 0) {
    // Soft delete: keep the row so order history stays intact, just hide it.
    await prisma.product.update({
      where: { id },
      data: { isPublished: false, stockQuantity: 0 },
    });
    logAudit({
      actorId: gate.session.user.id,
      action: "PRODUCT_DELETE",
      entityType: "product",
      entityId: id,
      metadata: { mode: "soft", orderItemCount },
    });
    return NextResponse.json({ ok: true, mode: "soft" });
  }

  // Hard delete when safe: images + cart items cascade; discount rules referencing
  // this product should also be removed.
  await prisma.$transaction([
    prisma.dealerDiscount.deleteMany({ where: { productId: id } }),
    prisma.cartItem.deleteMany({ where: { productId: id } }),
    prisma.productImage.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_DELETE",
    entityType: "product",
    entityId: id,
    metadata: { mode: "hard" },
  });

  return NextResponse.json({ ok: true, mode: "hard" });
}
