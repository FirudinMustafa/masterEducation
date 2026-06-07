import { put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import { productImageBlobKey } from "@/lib/images";

/**
 * Ürün görseli depolama soyutlaması.
 *
 * - **Vercel Blob:** `BLOB_READ_WRITE_TOKEN` tanımlıysa görsel Blob'a yüklenir
 *   ve `${NEXT_PUBLIC_BLOB_BASE_URL}/products/<filename>` ile servis edilir.
 * - **Yerel disk (VPS):** Token yoksa görsel `PRODUCT_UPLOAD_DIR` (default
 *   `public/images/products`) altına yazılır. `productImageUrl()`
 *   (lib/images.ts) `NEXT_PUBLIC_BLOB_BASE_URL` yokken `/images/products/<filename>`
 *   döndürür; bu yolu Next static / nginx upload dizininden servis eder.
 *
 * Neden: Hostinger VPS'te Vercel Blob'a outbound erişim/token sorunu olunca
 * `put()` exception atıyordu ve görseller "kaydolmuyor" gibi görünüyordu.
 * Bu sürücü, Vercel olmadan da görsel yüklemeyi çalıştırır.
 */

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function localUploadDir(): string {
  return (
    process.env.PRODUCT_UPLOAD_DIR ||
    path.join(process.cwd(), "public", "images", "products")
  );
}

export function productImageStorageDriver(): "blob" | "local" {
  return BLOB_TOKEN ? "blob" : "local";
}

/**
 * Görseli aktif sürücüye yazar. Hata olursa exception fırlatır — çağıran
 * try/catch ile anlamlı bir hata döndürmeli (görsel sessizce kaybolmasın).
 */
export async function storeProductImage(
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  if (BLOB_TOKEN) {
    await put(productImageBlobKey(filename), bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType,
      cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 yıl — filename hash'li, immutable
    });
    return;
  }

  const dir = localUploadDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), bytes);
}
