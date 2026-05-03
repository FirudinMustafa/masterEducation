import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PROJECT_ROOT = path.resolve(__dirname, "..");
const IMAGES_DIR = path.join(PROJECT_ROOT, "public", "images", "products");

async function main() {
  const refs = await prisma.productImage.findMany({ select: { filename: true }, take: 20 });
  console.log("Sample DB filenames (ProductImage.filename):");
  refs.forEach((r) => console.log(`  ${r.filename}`));

  const all = await prisma.productImage.findMany({ select: { filename: true } });
  const referenced = new Set(all.map((r) => r.filename));

  const files = fs.readdirSync(IMAGES_DIR);
  const orphans = files.filter((f) => !referenced.has(f));

  console.log(`\nTotal on disk: ${files.length}`);
  console.log(`Total referenced: ${referenced.size}`);
  console.log(`Orphans: ${orphans.length}`);

  console.log("\nSample orphan filenames (20 random):");
  const shuffled = orphans.slice().sort(() => Math.random() - 0.5).slice(0, 20);
  shuffled.forEach((f) => console.log(`  ${f}`));

  // Check if orphans match a pattern-variant (e.g. thumbnail prefix/suffix) of referenced ones
  console.log("\nPattern analysis:");
  const extCounts = new Map<string, number>();
  for (const f of orphans) {
    const ext = path.extname(f).toLowerCase();
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  for (const [ext, count] of [...extCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${ext || "(none)"}: ${count}`);
  }

  // Check if orphans are referenced under a transformed name (e.g. different casing, thumbnail prefix)
  let transformedMatches = 0;
  const orphanSet = new Set(orphans);
  for (const ref of referenced) {
    // Check common transforms
    const variants = [
      ref.toLowerCase(),
      ref.toUpperCase(),
      `thumb_${ref}`,
      `_${ref}`,
      ref.replace(/\.jpg$/i, ".jpeg"),
      ref.replace(/\.jpeg$/i, ".jpg"),
    ];
    for (const v of variants) {
      if (v !== ref && orphanSet.has(v)) transformedMatches++;
    }
  }
  console.log(`  Transform-matches (casing/ext/prefix variants): ${transformedMatches}`);

  // Size on disk
  let totalBytes = 0;
  for (const f of orphans) {
    try {
      totalBytes += fs.statSync(path.join(IMAGES_DIR, f)).size;
    } catch {}
  }
  console.log(`  Total orphan size on disk: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
