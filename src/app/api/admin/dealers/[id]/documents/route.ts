import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
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

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  // Admin belge yükleme limiti — kotu niyetli veya hatali betik korunmasi.
  const rl = rateLimit(`admin-doc-upload:${gate.session.user.id}`, 100, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Admin belge yükleme limiti asildi." },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const dealer = await prisma.dealer.findUnique({ where: { id } });
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
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
        ? "PDF, JPG, PNG veya WEBP yükleyin."
        : msg === "FILE_TOO_LARGE"
          ? "Dosya 8MB sinirini asiyor."
          : msg === "MIME_MISMATCH"
            ? "Dosya icerigi uzanti ile uyumsuz. Lütfen gercek bir PDF/resim yükleyin."
            : "Dosya kaydedilemedi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const doc = await prisma.dealerDocument.create({
    data: {
      dealerId: id,
      kind: rawKind as DealerDocumentKind,
      filename: stored.filename,
      origName: file.name.slice(0, 200),
      sizeBytes: stored.sizeBytes,
      uploadedBy: gate.session.user.id,
    },
  });

  logAudit({
    actorId: gate.session.user.id,
    action: "DEALER_DOCUMENT_UPLOAD",
    entityType: "dealer",
    entityId: id,
    metadata: { kind: rawKind, filename: stored.filename, sizeBytes: stored.sizeBytes, source: "admin" },
  });

  return NextResponse.json({
    id: doc.id,
    kind: doc.kind,
    filename: doc.filename,
    origName: doc.origName,
    url: `/api/dealer/documents/${doc.id}/download`,
    sizeBytes: doc.sizeBytes,
  });
}
