import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { publisherCreateSchema, flattenZodError } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (true) {
    const existing = await prisma.publisher.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
    i++;
    if (i > 500) throw new Error("slug-collision");
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = publisherCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const existingByName = await prisma.publisher.findUnique({
    where: { name: parsed.data.name },
  });
  if (existingByName) {
    return NextResponse.json(
      { error: "Bu adla bir yayınevi zaten var." },
      { status: 409 }
    );
  }

  const base = slugify(parsed.data.name);
  if (!base) {
    return NextResponse.json(
      { error: "Yayınevi adi gecerli bir slug uretmedi." },
      { status: 400 }
    );
  }
  const slug = await uniqueSlug(base);

  const pub = await prisma.publisher.create({
    data: { name: parsed.data.name, slug },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PUBLISHER_CREATE",
    entityType: "publisher",
    entityId: pub.id,
    metadata: { name: pub.name },
  });

  return NextResponse.json({ id: pub.id, slug: pub.slug });
}
