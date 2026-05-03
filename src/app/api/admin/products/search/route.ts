import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const publisherId = req.nextUrl.searchParams.get("publisherId")?.trim() ?? "";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(Math.floor(limitRaw), 500)
    : 20;

  // Publisher secili ise q < 2 olsa da filtreyle donelim (bulk picker kullaniyor).
  if (q.length < 2 && !publisherId) {
    return NextResponse.json({ products: [] });
  }

  const where: Record<string, unknown> = { isPublished: true };
  if (publisherId) where.publisherId = publisherId;
  if (q.length >= 2) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      publisher: { select: { name: true } },
    },
    take: limit,
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: Number(p.price),
      publisherName: p.publisher?.name ?? null,
    })),
  });
}
