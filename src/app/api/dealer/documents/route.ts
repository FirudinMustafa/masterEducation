import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { storeUpload } from "@/lib/uploads";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import type { DealerDocumentKind } from "@prisma/client";

const VALID_KINDS: DealerDocumentKind[] = [
  "TAX_CERTIFICATE",
  "TRADE_REG_GAZETTE",
  "SIGNATURE_CIRCULAR",
  "OTHER",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER" || !session.user.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const dealerId = session.user.dealerId;

  // Disk exhaustion + admin gurultu koruma: saatte 30 belge / bayi.
  const rl = rateLimit(`dealer-doc-upload:${dealerId}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Belge yukleme limiti asildi. Bir sure sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Form verisi okunamadi." }, { status: 400 });
  }

  const rawKind = form.get("kind");
  const file = form.get("file");
  if (typeof rawKind !== "string" || !VALID_KINDS.includes(rawKind as DealerDocumentKind)) {
    return NextResponse.json({ error: "Gecersiz belge tipi." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }

  let stored;
  try {
    stored = await storeUpload(file, "dealer-documents");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "UPLOAD_FAILED";
    const message =
      msg === "UNSUPPORTED_MIME"
        ? "PDF, JPG, PNG veya WEBP yukleyin."
        : msg === "FILE_TOO_LARGE"
          ? "Dosya 8MB sinirini asiyor."
          : msg === "MIME_MISMATCH"
            ? "Dosya icerigi uzanti ile uyumsuz. Lutfen gercek bir PDF/resim yukleyin."
            : "Dosya kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const doc = await prisma.dealerDocument.create({
    data: {
      dealerId,
      kind: rawKind as DealerDocumentKind,
      filename: stored.filename,
      origName: file.name.slice(0, 200),
      sizeBytes: stored.sizeBytes,
      uploadedBy: session.user.id,
    },
  });

  logAudit({
    actorId: session.user.id,
    action: "DEALER_DOCUMENT_UPLOAD",
    entityType: "dealer",
    entityId: dealerId,
    metadata: { kind: rawKind, filename: stored.filename, sizeBytes: stored.sizeBytes },
  });

  return NextResponse.json({
    id: doc.id,
    kind: doc.kind,
    filename: doc.filename,
    origName: doc.origName,
    url: stored.publicUrl,
    sizeBytes: doc.sizeBytes,
  });
}
