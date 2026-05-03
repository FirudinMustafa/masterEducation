/**
 * Tek seferlik: public/images/products/ altindaki tum gorselleri Vercel Blob'a
 * yukler. Idempotent — Blob'da ayni key ile dosya varsa atlanir (head check).
 *
 * Kullanim:
 *   1) Vercel'de Blob store provision edilmis ve BLOB_READ_WRITE_TOKEN .env'de
 *      olmali (`vercel env pull .env.local` ile cek).
 *   2) DATABASE_URL gerekmez — bu script DB'ye dokunmaz, sadece dosya tasir.
 *   3) `npx tsx scripts/upload-product-images-to-blob.ts`
 *      Resume etmek icin tekrar calistir; mevcut Blob'lari atlar.
 *
 * NOT: ProductImage.filename DB'de oldugu gibi kalir (ornek "0281567.png").
 * Render zamani productImageUrl(filename) ile NEXT_PUBLIC_BLOB_BASE_URL'a
 * prefix edilir.
 */
import "dotenv/config";
import { put, head } from "@vercel/blob";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";

const SOURCE_DIR = path.join(process.cwd(), "public", "images", "products");

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const CONCURRENCY = 16;

interface FileTask {
  filename: string;
  abspath: string;
  ext: string;
  size: number;
}

async function listImages(): Promise<FileTask[]> {
  let entries: string[];
  try {
    entries = await readdir(SOURCE_DIR);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.error(`Kaynak dizin yok: ${SOURCE_DIR}`);
      process.exit(1);
    }
    throw err;
  }

  const tasks: FileTask[] = [];
  for (const name of entries) {
    const ext = path.extname(name).toLowerCase();
    if (!MIME_BY_EXT[ext]) continue;
    const abspath = path.join(SOURCE_DIR, name);
    const st = await stat(abspath);
    if (!st.isFile()) continue;
    tasks.push({ filename: name, abspath, ext, size: st.size });
  }
  return tasks;
}

async function uploadOne(task: FileTask): Promise<"uploaded" | "skipped" | "error"> {
  const key = `products/${task.filename}`;
  // Halihazirda yuklenmis mi? head() varsa atla — idempotent resume.
  try {
    await head(buildPublicUrl(key));
    return "skipped";
  } catch {
    // 404 — yuklenmemis, devam et
  }

  try {
    const bytes = await readFile(task.abspath);
    await put(key, bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: MIME_BY_EXT[task.ext],
      cacheControlMaxAge: 60 * 60 * 24 * 365, // 1 yıl immutable
    });
    return "uploaded";
  } catch (err) {
    console.error(`HATA ${task.filename}:`, (err as Error).message);
    return "error";
  }
}

function buildPublicUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_BLOB_BASE_URL tanimli degil. Vercel'de Blob store baglandiktan sonra `vercel env pull .env.local` calistir."
    );
  }
  return `${base}/${key}`;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "BLOB_READ_WRITE_TOKEN env'i yok. Vercel'de Storage > Blob'u baglayip `vercel env pull .env.local` calistir."
    );
    process.exit(1);
  }

  const tasks = await listImages();
  console.log(`Bulundu: ${tasks.length} dosya. Hedef: Vercel Blob (products/ prefix).`);
  if (tasks.length === 0) return;

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;
  const total = tasks.length;
  const startedAt = Date.now();

  // Basit concurrency pool
  const queue = [...tasks];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      const result = await uploadOne(task);
      if (result === "uploaded") uploaded++;
      else if (result === "skipped") skipped++;
      else errors++;
      processed++;
      if (processed % 100 === 0 || processed === total) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = processed / elapsed;
        const eta = ((total - processed) / rate).toFixed(0);
        console.log(
          `  ${processed}/${total} (yuklendi=${uploaded}, atlandi=${skipped}, hata=${errors}) — ${rate.toFixed(1)}/s, ETA ${eta}s`
        );
      }
    }
  });
  await Promise.all(workers);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(
    `\nTamamlandi (${elapsed}s): ${uploaded} yuklendi, ${skipped} atlandi, ${errors} hata.`
  );
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
