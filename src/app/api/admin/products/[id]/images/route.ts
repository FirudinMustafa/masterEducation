import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { productImageBlobKey } from "@/lib/images";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function extensionFor(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return NextResponse.json({ error: "Urun bulunamadi." }, { status: 404 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Form verisi okunamadi." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Desteklenmeyen gorsel formati." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Dosya 5MB sinirini asiyor." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = extensionFor(file.type);
  const filename = `${product.id.slice(-8)}-${crypto
    .randomBytes(6)
    .toString("hex")}.${ext}`;
  await put(productImageBlobKey(filename), bytes, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
    cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 yıl — filename hashed, immutable
  });

  // Next pictureId unique per product.
  const maxPic = await prisma.productImage.aggregate({
    where: { productId: id },
    _max: { pictureId: true },
  });
  const pictureId = (maxPic._max.pictureId ?? 0) + 1;

  // Append to end of display order.
  const maxOrder = await prisma.productImage.aggregate({
    where: { productId: id },
    _max: { displayOrder: true },
  });
  const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  const image = await prisma.productImage.create({
    data: {
      productId: id,
      filename,
      pictureId,
      displayOrder,
    },
  });

  await prisma.product.update({
    where: { id },
    data: { hasImage: true },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_IMAGE_UPLOAD",
    entityType: "product",
    entityId: id,
    metadata: { imageId: image.id, filename, sizeBytes: bytes.length },
  });

  const { productImageUrl } = await import("@/lib/images");
  return NextResponse.json({
    id: image.id,
    filename,
    url: productImageUrl(filename),
    displayOrder,
  });
}
