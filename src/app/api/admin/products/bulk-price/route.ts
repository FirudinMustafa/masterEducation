import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";

const PREVIEW_SAMPLE = 20;
const MAX_AFFECTED = 50_000; // güvenlik üst sınırı

const filterSchema = z.object({
  publisherId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  discountGroup: z.string().min(1).optional(),
  isPublished: z.boolean().optional(),
  // Açık ID listesi (multi-select tarafından gelirse)
  productIds: z.array(z.string()).optional(),
});

const bodySchema = z.object({
  filter: filterSchema,
  mode: z.enum(["set", "percent_increase", "percent_decrease", "fixed_increase", "fixed_decrease"]),
  value: z.number(),
  minPrice: z.number().min(0).optional(), // % azalt durumunda alt taban (örn. 0)
  maxPrice: z.number().min(0).optional(), // güvenlik için
  dryRun: z.boolean().optional().default(false),
});

function buildWhere(
  filter: z.infer<typeof filterSchema>
): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  if (filter.publisherId) where.publisherId = filter.publisherId;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.discountGroup) where.discountGroup = filter.discountGroup;
  if (filter.isPublished !== undefined) where.isPublished = filter.isPublished;
  if (filter.productIds && filter.productIds.length > 0) {
    where.id = { in: filter.productIds };
  }
  return where;
}

function applyMode(
  current: number,
  mode: z.infer<typeof bodySchema>["mode"],
  value: number,
  minPrice: number | undefined,
  maxPrice: number | undefined
): number {
  let next: number;
  switch (mode) {
    case "set":
      next = value;
      break;
    case "percent_increase":
      next = current * (1 + value / 100);
      break;
    case "percent_decrease":
      next = current * (1 - value / 100);
      break;
    case "fixed_increase":
      next = current + value;
      break;
    case "fixed_decrease":
      next = current - value;
      break;
  }
  next = Math.round(next * 100) / 100;
  if (minPrice !== undefined && next < minPrice) next = minPrice;
  if (maxPrice !== undefined && next > maxPrice) next = maxPrice;
  if (next < 0) next = 0;
  return next;
}

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
  const { filter, mode, value, minPrice, maxPrice, dryRun } = parsed.data;

  // En az bir filtre veya productIds zorunlu — yanlislikla TUM ürünleri
  // değiştirmenin önüne geç.
  const hasFilter =
    !!filter.publisherId ||
    !!filter.categoryId ||
    !!filter.discountGroup ||
    filter.isPublished !== undefined ||
    (filter.productIds && filter.productIds.length > 0);
  if (!hasFilter) {
    return NextResponse.json(
      {
        error:
          "Yanlislikla tüm ürünleri etkilememek için en az bir filtre zorunlu (yayınevi, kategori, grup, durum veya secili ID).",
      },
      { status: 400 }
    );
  }

  const where = buildWhere(filter);
  const totalAffected = await prisma.product.count({ where });

  if (totalAffected === 0) {
    return NextResponse.json({
      affected: 0,
      sample: [],
      summary: null,
      applied: false,
    });
  }
  if (totalAffected > MAX_AFFECTED) {
    return NextResponse.json(
      {
        error: `Etkilenecek ürün sayısı (${totalAffected}) güvenlik üst sınırını (${MAX_AFFECTED}) aşıyor. Daha dar bir filtre kullanın.`,
      },
      { status: 400 }
    );
  }

  // Preview için tüm ürünleri (ID + price) çek — yeni fiyatları hesapla
  const all = await prisma.product.findMany({
    where,
    select: { id: true, name: true, sku: true, price: true },
  });

  const updates = all.map((p) => {
    const current = Number(p.price);
    const next = applyMode(current, mode, value, minPrice, maxPrice);
    return { id: p.id, name: p.name, sku: p.sku, current, next };
  });

  const newPrices = updates.map((u) => u.next);
  const summary = {
    minNew: Math.min(...newPrices),
    maxNew: Math.max(...newPrices),
    avgNew:
      Math.round(
        (newPrices.reduce((s, n) => s + n, 0) / newPrices.length) * 100
      ) / 100,
    minOld: Math.min(...updates.map((u) => u.current)),
    maxOld: Math.max(...updates.map((u) => u.current)),
  };

  const sample = updates.slice(0, PREVIEW_SAMPLE);

  if (dryRun) {
    return NextResponse.json({
      affected: totalAffected,
      sample,
      summary,
      applied: false,
    });
  }

  // Apply: tek ortak değer (set) ise updateMany; degisken (percent/fixed) ise
  // tek tek update transaction.
  let updatedCount = 0;
  if (mode === "set") {
    const r = await prisma.product.updateMany({
      where,
      data: { price: value },
    });
    updatedCount = r.count;
  } else {
    // Group by next-price → batch updateMany
    const buckets = new Map<number, string[]>();
    for (const u of updates) {
      const arr = buckets.get(u.next) ?? [];
      arr.push(u.id);
      buckets.set(u.next, arr);
    }
    await prisma.$transaction(
      Array.from(buckets.entries()).map(([nextPrice, ids]) =>
        prisma.product.updateMany({
          where: { id: { in: ids } },
          data: { price: nextPrice },
        })
      )
    );
    updatedCount = updates.length;
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_BULK_PRICE_UPDATE",
    entityType: "product",
    entityId: "bulk",
    metadata: {
      affected: updatedCount,
      filter,
      mode,
      value,
      minPrice,
      maxPrice,
      summary,
      sampleIds: updates.slice(0, 20).map((u) => u.id),
    },
  });

  return NextResponse.json({
    affected: updatedCount,
    sample,
    summary,
    applied: true,
  });
}
