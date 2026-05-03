import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { productImageUrl } from "@/lib/images";

const MAX_RESULTS = 8;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = rateLimit(`search:${ip}`, 60, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Cok hizli." }, { status: 429 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ products: [], publishers: [], categories: [] });
  }

  const [products, publishers, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        isPublished: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        price: true,
        publisher: { select: { name: true } },
        images: {
          orderBy: { displayOrder: "asc" },
          take: 1,
          select: { filename: true },
        },
      },
      take: MAX_RESULTS,
      orderBy: [{ stockQuantity: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.publisher.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { slug: true, name: true, _count: { select: { products: true } } },
      take: 4,
    }),
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { slug: true, name: true, _count: { select: { products: true } } },
      take: 4,
    }),
  ]);

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: Number(p.price),
      publisherName: p.publisher?.name ?? null,
      imageSrc: p.images[0] ? productImageUrl(p.images[0].filename) : null,
    })),
    publishers: publishers.map((p) => ({
      slug: p.slug,
      name: p.name,
      count: p._count.products,
    })),
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: c._count.products,
    })),
  });
}
