/**
 * DB'deki product_images.filename değerleri seed sırasında hardcoded `.png`
 * olarak yazıldı. Gerçek dosyalar lokal `public/images/products/` dizininde
 * farklı uzantılarda olabilir (jpeg, webp, gif). Bu script:
 *   1. Lokal dizini tarar, her pictureId için gerçek uzantıyı tespit eder.
 *   2. DB'deki filename'leri günceller.
 *   3. Etkilenen ürünlerin hasImage flag'ini de doğrular.
 *
 * Idempotent — birden fazla çalıştırılabilir.
 */
import "dotenv/config";
import pg from "pg";
import { readdir } from "fs/promises";
import path from "path";

const SOURCE_DIR = path.join(process.cwd(), "public", "images", "products");

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL set degil");

  console.log("Lokal dizin taranıyor:", SOURCE_DIR);
  const entries = await readdir(SOURCE_DIR);

  // pictureId -> actual filename map (e.g., 294544 -> "0294544.jpeg")
  const pictureIdToFilename = new Map<number, string>();
  for (const name of entries) {
    const m = name.match(/^(\d+)\.(png|jpe?g|webp|gif)$/i);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (Number.isNaN(id)) continue;
    pictureIdToFilename.set(id, name);
  }
  console.log(`Lokal dosya sayısı: ${pictureIdToFilename.size}`);

  const c = new pg.Client({ connectionString: url });
  await c.connect();

  // DB'deki tüm görsel kayıtlarını çek
  const dbImages = await c.query<{
    id: string;
    productId: string;
    pictureId: number;
    filename: string;
  }>(
    `SELECT id, "productId", "pictureId", filename FROM product_images`
  );
  console.log(`DB görsel kaydı: ${dbImages.rows.length}`);

  let updated = 0;
  let skipped = 0;
  let missing = 0;
  const productsTouched = new Set<string>();

  for (const row of dbImages.rows) {
    const actual = pictureIdToFilename.get(row.pictureId);
    if (!actual) {
      missing++;
      continue;
    }
    if (row.filename === actual) {
      skipped++;
      continue;
    }
    await c.query(
      `UPDATE product_images SET filename = $1 WHERE id = $2`,
      [actual, row.id]
    );
    productsTouched.add(row.productId);
    updated++;
    if (updated % 500 === 0) {
      console.log(`  ${updated} kayıt güncellendi...`);
    }
  }

  // Etkilenen ürünlerin hasImage'i tekrar doğrula
  if (productsTouched.size > 0) {
    await c.query(
      `UPDATE products SET "hasImage" = true WHERE id = ANY($1::text[])`,
      [Array.from(productsTouched)]
    );
  }

  console.log(`\nTamamlandı:`);
  console.log(`  ${updated} kayıt güncellendi (uzantı düzeltildi)`);
  console.log(`  ${skipped} kayıt zaten doğruydu`);
  console.log(`  ${missing} kayıt için lokal dosya bulunamadı`);
  console.log(`  ${productsTouched.size} ürün için hasImage=true tazelendi`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
