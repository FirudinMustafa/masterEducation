import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const MAX_IDS = 1000;

// Sadece "guvenli" alanlar bulk ile güncellenebilir. name/sku/slug bulk'a uygun
// degil (tek tek hedefli düzenleme gerek). KDV/fiyat/stok/kategori/yayinevi
// gibi tüm ürün için aynı değer alabilen alanlar bu listede.
const patchSchema = z
  .object({
    price: z.number().min(0).max(9_999_999).optional(),
    oldPrice: z.number().min(0).max(9_999_999).nullable().optional(),
    vatRate: z.number().min(0).max(100).optional(),
    stockQuantity: z.number().int().min(0).max(1_000_000).optional(),
    categoryId: z.string().nullable().optional(),
    publisherId: z.string().nullable().optional(),
    discountGroup: z.string().max(100).nullable().optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "En az bir alan güncellenmeli.",
  });

const bodySchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
  patch: patchSchema,
});

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { productIds, patch } = parsed.data;

  // FK validasyonu — kategoriId/publisherId verildiyse var olmasi şart
  // (tek tek update'te Prisma FK constraint hatasi cirkin gözukurdu).
  if (patch.categoryId) {
    const c = await prisma.category.count({ where: { id: patch.categoryId } });
    if (c === 0) {
      return NextResponse.json({ error: "Kategori bulunamadi." }, { status: 400 });
    }
  }
  if (patch.publisherId) {
    const p = await prisma.publisher.count({ where: { id: patch.publisherId } });
    if (p === 0) {
      return NextResponse.json({ error: "Yayınevi bulunamadi." }, { status: 400 });
    }
  }

  // Tek updateMany — partial-set semantics: tüm verilen alanlar tüm ID'lerde set
  // edilir. Bu basit/hizli ama tek transaction.
  const result = await prisma.product.updateMany({
    where: { id: { in: productIds } },
    data: {
      ...(patch.price !== undefined && { price: patch.price }),
      ...(patch.oldPrice !== undefined && { oldPrice: patch.oldPrice }),
      ...(patch.vatRate !== undefined && { vatRate: patch.vatRate }),
      ...(patch.stockQuantity !== undefined && {
        stockQuantity: patch.stockQuantity,
      }),
      ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
      ...(patch.publisherId !== undefined && { publisherId: patch.publisherId }),
      ...(patch.discountGroup !== undefined && {
        discountGroup: patch.discountGroup,
      }),
      ...(patch.isPublished !== undefined && { isPublished: patch.isPublished }),
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_BULK_UPDATE",
    entityType: "product",
    entityId: "bulk",
    metadata: {
      count: result.count,
      requestedCount: productIds.length,
      fields: Object.keys(patch),
      patch,
      sampleIds: productIds.slice(0, 20),
    },
  });

  return NextResponse.json({ updated: result.count });
}
