import { put, del } from "@vercel/blob";
import crypto from "crypto";

const ALLOWED_DOCUMENT_MIME = new Map<string, string>([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB

export type UploadKind = "dealer-documents";

export interface StoredFile {
  // Vercel Blob URL — DB'ye bu yazılır, indirme akışında auth-gated endpoint
  // bu URL'den fetch edip stream eder.
  filename: string;
  // İstemciye dönülen indirme endpoint'i — auth zorunlu.
  publicUrl: string;
  sizeBytes: number;
}

/**
 * Client-iddiali MIME tipini dosya icerigi ile dogrular. Bazi dosya turleri
 * icin "magic bytes" (file signature) kontrolu yapilir — boylece kullanici
 * Content-Type'i yalan soylese bile bypass edemez.
 *
 * PDF  : "%PDF-"  (25 50 44 46 2D)
 * JPEG : FF D8 FF
 * PNG  : 89 50 4E 47 0D 0A 1A 0A
 * WEBP : "RIFF....WEBP" (52 49 46 46 xx xx xx xx 57 45 42 50)
 */
export function verifyMagicBytes(
  bytes: Uint8Array,
  claimedMime: string,
): boolean {
  if (bytes.length < 12) return false;
  const b = bytes;
  switch (claimedMime) {
    case "application/pdf":
      return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
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
    default:
      return false;
  }
}

/**
 * Bayi belgeleri Vercel Blob'a yüklenir. URL'lere unguessable random suffix
 * eklenir (Blob default davranışı), dolayısıyla URL doğrudan paylaşılırsa bile
 * brute-force ile bulunamaz. Buna ek olarak indirme her zaman auth-gated
 * `/api/dealer/documents/[id]/download` üzerinden, yani server-side fetch +
 * yetki kontrolü yapılır — istemciye Blob URL hiç sızmaz.
 */
export async function storeUpload(
  file: File,
  kind: UploadKind
): Promise<StoredFile> {
  const ext = ALLOWED_DOCUMENT_MIME.get(file.type);
  if (!ext) {
    throw new Error("UNSUPPORTED_MIME");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Content-Type'i client soyleyebilir — gercek dosya icerigini dogrula.
  if (!verifyMagicBytes(bytes, file.type)) {
    throw new Error("MIME_MISMATCH");
  }

  const baseName = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
  const blob = await put(`${kind}/${baseName}`, bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
    cacheControlMaxAge: 0,
  });

  return {
    filename: blob.url,
    publicUrl: `/api/dealer/documents/by-blob/download`,
    sizeBytes: bytes.length,
  };
}

export async function deleteUpload(
  _kind: UploadKind,
  filenameOrUrl: string
): Promise<void> {
  // filename alanı eskiden bare filename idi, şimdi tam Blob URL.
  // Yalnız HTTPS Blob URL'lerini sil; legacy dosya adlarını sessizce yoksay.
  if (!/^https?:\/\//i.test(filenameOrUrl)) return;
  try {
    await del(filenameOrUrl);
  } catch {
    // Blob silinemediyse DB temizliği zaten yapıldı — sessizce yut.
  }
}

export function isAllowedDocumentMime(mime: string): boolean {
  return ALLOWED_DOCUMENT_MIME.has(mime);
}
