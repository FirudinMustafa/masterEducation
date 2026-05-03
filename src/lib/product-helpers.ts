/**
 * Client-safe product helpers (no Prisma imports).
 * Server-only helpers live in `product-ratings.ts`.
 */

export const NEW_PRODUCT_WINDOW_DAYS = 30;

export function isProductNew(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false;
  const t =
    typeof createdAt === "string" ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_PRODUCT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
