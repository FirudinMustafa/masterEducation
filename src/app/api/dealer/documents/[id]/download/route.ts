import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Auth-gated belge indirme.
 *
 * Yetki:
 *   - Bayi yalniz kendi belgelerini indirir
 *   - Admin tum belgelere erisir
 *   - Diger roller 403
 *
 * `DealerDocument.filename` Vercel Blob URL'idir. URL paylaşılsa bile random
 * suffix nedeniyle bulunması zordur, ama yine de istemciye sızdırmıyoruz —
 * server-side fetch edip stream ediyoruz, böylece auth check her zaman
 * geçerli kalır.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { id } = await context.params;
  const doc = await prisma.dealerDocument.findUnique({
    where: { id },
    select: {
      id: true,
      filename: true,
      origName: true,
      dealerId: true,
      dealer: { select: { userId: true } },
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Belge bulunamadi." }, { status: 404 });
  }

  // Yetki: admin her zaman; bayi sadece kendi belgesini
  const isAdmin = session.user.role === "ADMIN";
  const isOwner =
    session.user.role === "DEALER" &&
    doc.dealer?.userId === session.user.id;

  if (!isAdmin && !isOwner) {
    // 404 — varlık sızdırma
    return NextResponse.json({ error: "Belge bulunamadi." }, { status: 404 });
  }

  // filename alani Blob URL olmali. Eski dosyalar (legacy disk path) destek
  // disi — repo fresh-deploy edildigi icin bu durum normalde olusmaz.
  if (!/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i.test(doc.filename)) {
    return NextResponse.json(
      { error: "Belge depolama formati gecersiz." },
      { status: 500 }
    );
  }

  const blobRes = await fetch(doc.filename, { cache: "no-store" });
  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json(
      { error: "Belge dosyasi bulunamadi." },
      { status: 404 }
    );
  }

  // MIME — Blob URL pathname'inden uzantı çıkar
  const pathname = new URL(doc.filename).pathname;
  const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    blobRes.headers.get("content-type") ??
    MIME_BY_EXT[ext] ??
    "application/octet-stream";
  const safeOrig = (doc.origName ?? "belge").replace(/["\\\r\n]/g, "");
  const contentLength = blobRes.headers.get("content-length");

  return new NextResponse(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": mime,
      ...(contentLength ? { "Content-Length": contentLength } : {}),
      "Content-Disposition": `inline; filename="${safeOrig}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
