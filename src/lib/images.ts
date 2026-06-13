/**
 * Ürün görselleri için URL üreticisi.
 *
 * - Production: Vercel Blob'tan servis edilir.
 *   `NEXT_PUBLIC_BLOB_BASE_URL` env'i set edilirse `${BASE}/products/${filename}`
 *   döner. Tüm ürün görselleri Blob'a `products/` prefix'i altında yüklenir.
 *
 * - Dev fallback: env yoksa lokal `/public/images/products/` dizinini kullanır
 *   (geliştirici lokal kopya tutuyorsa). Prod build'de env mutlaka set olmalı.
 *
 * `filename` DB'deki `ProductImage.filename` ile birebir aynıdır — örn.
 * `0281567.png` veya `<productId>-<random>.jpg`. Bu sade format Blob key'i
 * olarak da kullanılır (üzerinde random suffix eklenmez).
 */
export function productImageUrl(filename: string): string {
  if (!filename) return "";
  const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL?.replace(/\/+$/, "");
  if (base) {
    return `${base}/products/${filename}`;
  }
  return `/images/products/${filename}`;
}

/**
 * Blob'a ürün görseli yüklerken kullanılacak pathname (key) — `products/`
 * prefix'i ile her zaman aynı dizinde tutulur.
 */
export function productImageBlobKey(filename: string): string {
  return `products/${filename}`;
}

/**
 * Ana sayfa banner görselleri — ürün görselleriyle aynı mantık, `banners/`
 * prefix'i altında. Blob env'i yoksa lokal `/images/banners/`.
 */
export function bannerImageUrl(filename: string): string {
  if (!filename) return "";
  const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL?.replace(/\/+$/, "");
  if (base) {
    return `${base}/banners/${filename}`;
  }
  return `/images/banners/${filename}`;
}

export function bannerImageBlobKey(filename: string): string {
  return `banners/${filename}`;
}
