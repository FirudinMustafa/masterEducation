import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { productCreateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.product.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i++;
    if (i > 500) throw new Error("slug-collision");
  }
  return slug;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = productCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const baseSlug = slugify(data.name);
  if (!baseSlug) {
    return NextResponse.json(
      { error: "Ürün adi slug oluşturmak icin uygun degil." },
      { status: 400 }
    );
  }

  const slug = await uniqueSlug(baseSlug);

  const maxNopId = await prisma.product.aggregate({ _max: { nopId: true } });
  const nopId = (maxNopId._max.nopId ?? 0) + 1;

  const product = await prisma.product.create({
    data: {
      name: data.name,
      // nameEn formdan kaldırıldı (2026-06-08); kolon korunur, null bırakılır.
      nameEn: null,
      slug,
      sku: data.sku,
      price: data.price,
      oldPrice: data.oldPrice ?? null,
      vatRate: data.vatRate,
      stockQuantity: data.stockQuantity,
      publisherId: data.publisherId ?? null,
      categoryId: data.categoryId ?? null,
      anaTur: data.anaTur ?? null,
      detayTur: data.detayTur ?? null,
      language: data.language ?? null,
      productType: data.productType ?? null,
      discountGroup: data.discountGroup ?? null,
      authorCode: data.authorCode ?? null,
      isPublished: data.isPublished,
      nopId,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_CREATE",
    entityType: "product",
    entityId: product.id,
    metadata: {
      name: product.name,
      sku: product.sku,
      price: Number(product.price),
    },
  });

  return NextResponse.json({ id: product.id, slug: product.slug });
}
