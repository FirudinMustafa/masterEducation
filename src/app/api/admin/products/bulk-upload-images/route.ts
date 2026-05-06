import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { productImageBlobKey } from "@/lib/images";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_MIME = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 500;

/**
 * Magic-bytes ile dosya türü doğrulaması (uploads.ts ile aynı pattern).
 * Görsel için JPEG/PNG/WEBP/GIF yeterli.
 */
function verifyImageBytes(bytes: Uint8Array, claimedMime: string): boolean {
  if (bytes.length < 12) return false;
  const b = bytes;
  switch (claimedMime) {
    case "image/jpeg":
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/png":
      return (
        b[0] === 0x89 &&
        b[1] === 0x50 &&
        b[2] === 0x4e &&
        b[3] === 0x47 &&
        b[4] === 0x0d &&
        b[5] === 0x0a &&
        b[6] === 0x1a &&
        b[7] === 0x0a
      );
    case "image/webp":
      return (
        b[0] === 0x52 &&
        b[1] === 0x49 &&
        b[2] === 0x46 &&
        b[3] === 0x46 &&
        b[8] === 0x57 &&
        b[9] === 0x45 &&
        b[10] === 0x42 &&
        b[11] === 0x50
      );
    case "image/gif":
      return (
        (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) // "GIF"
      );
    default:
      return false;
  }
}

/**
 * Dosya adından SKU çıkar: "9780007235988.jpg" → "9780007235988"
 * Sub-path varsa son segmenti al; uzantıyı çıkar.
 */
function extractSkuFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return base.replace(/\.(jpg|jpeg|png|webp|gif)$/i, "").trim();
}

interface ProcessedFile {
  filename: string;
  sku: string;
  status: "matched" | "unmatched" | "invalid_mime" | "too_large" | "magic_mismatch";
  productId?: string;
  productName?: string;
  size: number;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  // P3-API-1: Per-admin rate-limit (admin bile yanlışlıkla 500-dosya zip
  // upload'unu döngüye sokarsa Blob + DB üzerinde DoS riski). 10/dk.
  const rl = rateLimit(`bulk-image-upload:${gate.session.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Cok hizli toplu yukleme — kisa bir sure bekleyin." },
      { status: 429 }
    );
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Form verisi okunamadi." },
      { status: 400 }
    );
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "En az bir dosya gerekli." },
      { status: 400 }
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Tek seferde en fazla ${MAX_FILES} dosya yüklenebilir.` },
      { status: 400 }
    );
  }

  // Tüm dosyaları parse et — SKU çıkar, MIME ve boyut kontrol et
  const parsed: ProcessedFile[] = [];
  const skuToFiles = new Map<string, number[]>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sku = extractSkuFromFilename(file.name);
    let status: ProcessedFile["status"] = "matched"; // tentative

    if (!ALLOWED_MIME.has(file.type)) {
      status = "invalid_mime";
    } else if (file.size > MAX_BYTES) {
      status = "too_large";
    }

    parsed.push({
      filename: file.name,
      sku,
      status,
      size: file.size,
    });

    if (status === "matched") {
      // Aynı SKU'ya birden fazla dosya geldi mi?
      const arr = skuToFiles.get(sku) ?? [];
      arr.push(i);
      skuToFiles.set(sku, arr);
    }
  }

  // SKU'ları DB'de ara
  const skus = Array.from(skuToFiles.keys());
  const products =
    skus.length > 0
      ? await prisma.product.findMany({
          where: { sku: { in: skus } },
          select: { id: true, sku: true, name: true },
        })
      : [];
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  for (const p of parsed) {
    if (p.status !== "matched") continue;
    const prod = productBySku.get(p.sku);
    if (!prod) {
      p.status = "unmatched";
      continue;
    }
    p.productId = prod.id;
    p.productName = prod.name;
  }

  const counts = {
    total: parsed.length,
    matched: parsed.filter((p) => p.status === "matched").length,
    unmatched: parsed.filter((p) => p.status === "unmatched").length,
    invalid: parsed.filter(
      (p) =>
        p.status === "invalid_mime" ||
        p.status === "too_large" ||
        p.status === "magic_mismatch"
    ).length,
  };

  // Aynı SKU'ya birden fazla dosya — duplicate uyarısı
  const duplicates: string[] = [];
  for (const [sku, indexes] of skuToFiles) {
    if (indexes.length > 1) duplicates.push(sku);
  }

  if (dryRun) {
    return NextResponse.json({
      counts,
      duplicates,
      preview: parsed.slice(0, 100),
      applied: false,
    });
  }

  if (counts.matched === 0) {
    return NextResponse.json(
      {
        error: "Eşleşen dosya yok. SKU'ları ve formatları kontrol edin.",
        counts,
        preview: parsed.slice(0, 50),
      },
      { status: 400 }
    );
  }

  // APPLY: matched dosyaları Blob'a kaydet
  let saved = 0;
  const errors: Array<{ filename: string; error: string }> = [];
  const productsTouched = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    if (p.status !== "matched" || !p.productId) continue;
    const file = files[i];

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      // Magic bytes — DOĞRULA, kullanıcının yalan söylediği MIME'a güvenme
      if (!verifyImageBytes(bytes, file.type)) {
        p.status = "magic_mismatch";
        errors.push({
          filename: p.filename,
          error: "Dosya icerigi MIME ile uyusmuyor",
        });
        continue;
      }

      const ext = ALLOWED_MIME.get(file.type) ?? "bin";
      const filename = `${p.productId.slice(-8)}-${crypto
        .randomBytes(6)
        .toString("hex")}.${ext}`;
      await put(productImageBlobKey(filename), bytes, {
        access: "public",
        addRandomSuffix: false,
        contentType: file.type,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });

      const maxPic = await prisma.productImage.aggregate({
        where: { productId: p.productId },
        _max: { pictureId: true },
      });
      const pictureId = (maxPic._max.pictureId ?? 0) + 1;
      const maxOrder = await prisma.productImage.aggregate({
        where: { productId: p.productId },
        _max: { displayOrder: true },
      });
      const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

      await prisma.productImage.create({
        data: {
          productId: p.productId,
          filename,
          pictureId,
          displayOrder,
        },
      });
      productsTouched.add(p.productId);
      saved++;
    } catch (e) {
      errors.push({
        filename: p.filename,
        error: e instanceof Error ? e.message : "yazma hatasi",
      });
    }
  }

  // Toplu hasImage=true (touched products için)
  if (productsTouched.size > 0) {
    await prisma.product.updateMany({
      where: { id: { in: Array.from(productsTouched) } },
      data: { hasImage: true },
    });
  }

  // Magic-bytes hata sayisi counts'a yansisin
  const newCounts = {
    ...counts,
    matched: saved,
    invalid:
      counts.invalid +
      parsed.filter((p) => p.status === "magic_mismatch").length,
  };

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_BULK_IMAGE_UPLOAD",
    entityType: "product",
    entityId: "bulk",
    metadata: {
      saved,
      total: parsed.length,
      duplicates,
      errorCount: errors.length,
      productsTouched: productsTouched.size,
    },
  });

  return NextResponse.json({
    counts: newCounts,
    saved,
    productsTouched: productsTouched.size,
    duplicates,
    errors: errors.slice(0, 50),
    applied: true,
  });
}
