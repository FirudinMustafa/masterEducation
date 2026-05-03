import { prisma } from "@/lib/prisma";

export interface ProductRating {
  avg: number;
  count: number;
}

/**
 * Batch-fetch average rating + approved review count for a set of product ids.
 * Only APPROVED reviews are counted — PENDING/REJECTED are hidden on storefront.
 */
export async function getProductRatings(
  ids: string[]
): Promise<Map<string, ProductRating>> {
  if (ids.length === 0) return new Map();
  const aggs = await prisma.productReview.groupBy({
    by: ["productId"],
    where: { productId: { in: ids }, status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    aggs.map((a) => [
      a.productId,
      { avg: Number(a._avg.rating ?? 0), count: a._count._all },
    ])
  );
}
