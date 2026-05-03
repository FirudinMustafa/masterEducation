import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/error-log";

/**
 * Postgres full-text search for products.
 *
 * - Uses `searchDoc` tsvector (generated column) + `websearch_to_tsquery('turkish', ...)`
 *   so users can type phrases, quotes, OR and - operators naturally.
 * - If the FTS path throws (malformed query syntax, etc.), falls back to
 *   case-insensitive ILIKE across name + sku + nameEn so the user always
 *   gets *some* reasonable result instead of a 500.
 */
export async function searchProductIds(
  query: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ ids: string[]; total: number }> {
  const q = query.trim();
  if (q.length < 2) return { ids: [], total: 0 };

  const limit = Math.min(opts.limit ?? 24, 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT id
        FROM "products"
        WHERE "isPublished" = true
          AND "searchDoc" @@ websearch_to_tsquery('turkish', ${q})
        ORDER BY ts_rank("searchDoc", websearch_to_tsquery('turkish', ${q})) DESC,
                 "stockQuantity" > 0 DESC,
                 "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    );

    const totalRow = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "products"
        WHERE "isPublished" = true
          AND "searchDoc" @@ websearch_to_tsquery('turkish', ${q})
      `
    );

    const total = Number(totalRow[0]?.count ?? 0);
    return { ids: rows.map((r) => r.id), total };
  } catch (err) {
    // FTS parse hatalari (kotu karakter, bozuk tsquery) kullaniciya 500
    // donmesin — log at, ILIKE ile fallback yap.
    logError({
      source: "server",
      message: `FTS fallback: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { query: q, subsystem: "search" },
    });
    return fallbackLikeSearch(q, limit, offset);
  }
}

async function fallbackLikeSearch(
  q: string,
  limit: number,
  offset: number,
): Promise<{ ids: string[]; total: number }> {
  const pattern = `%${q}%`;
  const [rows, totalRow] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`
        SELECT id
        FROM "products"
        WHERE "isPublished" = true
          AND ("name" ILIKE ${pattern}
            OR "sku" ILIKE ${pattern}
            OR COALESCE("nameEn", '') ILIKE ${pattern})
        ORDER BY "stockQuantity" > 0 DESC, "createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    ),
    prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "products"
        WHERE "isPublished" = true
          AND ("name" ILIKE ${pattern}
            OR "sku" ILIKE ${pattern}
            OR COALESCE("nameEn", '') ILIKE ${pattern})
      `,
    ),
  ]);

  return {
    ids: rows.map((r) => r.id),
    total: Number(totalRow[0]?.count ?? 0),
  };
}
