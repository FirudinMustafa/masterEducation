import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { categoryCreateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
    i++;
    if (i > 500) throw new Error("slug-collision");
  }
}

export async function GET() {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      type: c.type,
      productCount: c._count.products,
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = categoryCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const base = slugify(parsed.data.name);
  if (!base) {
    return NextResponse.json(
      { error: "Kategori adi gecerli bir slug uretmedi." },
      { status: 400 }
    );
  }
  const slug = await uniqueSlug(base);

  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      slug,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "CATEGORY_CREATE",
    entityType: "category",
    entityId: category.id,
    metadata: { name: category.name, type: category.type },
  });

  return NextResponse.json({ id: category.id, slug: category.slug });
}
