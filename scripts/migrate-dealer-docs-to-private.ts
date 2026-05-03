/**
 * Mevcut dealer document dosyalarini public/uploads/dealer-documents/'tan
 * private/uploads/dealer-documents/'a tasir. Tek seferlik migration.
 *
 * Bu, "public dizin = direkt URL erisimi" guvenlik acigi icin kapama.
 *
 * NOT: DB schema degismez (`DealerDocument.filename` ayni). Yalnız diskteki
 * dosya konumu degisir + serve mekanizmasi auth-gated /download endpoint'i
 * kullanir.
 */
import { readdir, mkdir, rename, rm, stat } from "fs/promises";
import path from "path";
import "dotenv/config";

const PUBLIC_DIR = path.join(
  process.cwd(),
  "public",
  "uploads",
  "dealer-documents"
);
const PRIVATE_DIR = path.join(
  process.cwd(),
  "private",
  "uploads",
  "dealer-documents"
);

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  if (!(await exists(PUBLIC_DIR))) {
    console.log("[migrate] public dizin yok, taşınacak dosya yok.");
    return;
  }

  await mkdir(PRIVATE_DIR, { recursive: true });

  const files = await readdir(PUBLIC_DIR);
  let moved = 0;
  let skipped = 0;

  for (const filename of files) {
    const src = path.join(PUBLIC_DIR, filename);
    const dst = path.join(PRIVATE_DIR, filename);

    if (await exists(dst)) {
      console.log(`  [skip] ${filename} zaten private/'da var`);
      skipped++;
      continue;
    }

    await rename(src, dst);
    console.log(`  [move] ${filename}`);
    moved++;
  }

  // Boş kalan public dir'i temizle (ileride yanlışlıkla yazılmasını engelle)
  const remaining = await readdir(PUBLIC_DIR);
  if (remaining.length === 0) {
    await rm(PUBLIC_DIR, { recursive: true });
    console.log(`[migrate] public dizin silindi (boş)`);
  } else {
    console.log(
      `[warn] public dizinde ${remaining.length} dosya kaldı, manuel kontrol gerekebilir`
    );
  }

  console.log(`\n[done] taşınan=${moved} atlanan=${skipped}`);
})();
