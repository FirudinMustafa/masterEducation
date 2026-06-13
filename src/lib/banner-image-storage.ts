import { put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import { bannerImageBlobKey } from "@/lib/images";

/**
 * Banner görseli depolama — ürün görseli sürücüsüyle aynı mantık (bkz.
 * product-image-storage.ts): Blob token varsa Vercel Blob (`banners/` prefix),
 * yoksa yerel disk (`BANNER_UPLOAD_DIR` veya public/images/banners).
 */
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function localUploadDir(): string {
  return (
    process.env.BANNER_UPLOAD_DIR ||
    path.join(process.cwd(), "public", "images", "banners")
  );
}

export async function storeBannerImage(
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  if (BLOB_TOKEN) {
    await put(bannerImageBlobKey(filename), bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return;
  }
  const dir = localUploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
}
