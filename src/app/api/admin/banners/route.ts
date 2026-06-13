import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { logError } from "@/lib/error-log";
import { storeBannerImage } from "@/lib/banner-image-storage";
import { bannerImageUrl } from "@/lib/images";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
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

/** Yeni banner — multipart: file (zorunlu) + title/linkUrl (opsiyonel). */
export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Form verisi okunamadı." }, { status: 400 });
  }
  const file = formData.get("file");
  const title = (formData.get("title") as string | null)?.trim() || null;
  const linkUrl = (formData.get("linkUrl") as string | null)?.trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Görsel dosyası gerekli." }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Desteklenmeyen görsel formatı." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Dosya 5MB sınırını aşıyor." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = extensionFor(file.type);
  const filename = `banner-${crypto.randomBytes(8).toString("hex")}.${ext}`;

  try {
    await storeBannerImage(filename, bytes, file.type);
  } catch (err) {
    logError({
      source: "api",
      message: `Banner görseli depolanamadı: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : null,
      metadata: { filename },
    });
    return NextResponse.json(
      { error: "Görsel depolanamadı. Depolama yapılandırmasını kontrol edin." },
      { status: 500 }
    );
  }

  const maxOrder = await prisma.banner.aggregate({ _max: { displayOrder: true } });
  const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  const banner = await prisma.banner.create({
    data: { title, linkUrl, imageUrl: bannerImageUrl(filename), displayOrder },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "BANNER_CREATE",
    entityType: "banner",
    entityId: banner.id,
    metadata: { filename },
  });

  return NextResponse.json({ ok: true, id: banner.id });
}
