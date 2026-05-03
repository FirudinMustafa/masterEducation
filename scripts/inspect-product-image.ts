import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const slug = process.argv[2] ?? "voca-tooki-almanca-66299";

(async () => {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: { images: true, publisher: true },
  });

  if (!product) {
    console.log(`Urun bulunamadi: ${slug}`);
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== URUN ===");
  console.log(`  id           : ${product.id}`);
  console.log(`  nopId        : ${product.nopId}`);
  console.log(`  name         : ${product.name}`);
  console.log(`  slug         : ${product.slug}`);
  console.log(`  sku          : ${product.sku}`);
  console.log(`  isPublished  : ${product.isPublished}`);
  console.log(`  hasImage     : ${product.hasImage}`);
  console.log(`  publisher    : ${product.publisher?.name ?? "(yok)"}`);
  console.log(`  images count : ${product.images.length}`);

  if (product.images.length > 0) {
    console.log("\n=== DB'DE PRODUCT IMAGES ===");
    product.images.forEach((img, i) => {
      const abs = path.join(process.cwd(), "public", "images", "products", img.filename);
      const exists = fs.existsSync(abs);
      console.log(`  [${i}] ${img.filename} (pictureId=${img.pictureId})`);
      console.log(`      Disk'te: ${exists ? "VAR" : "YOK"} (${abs})`);
    });
  } else {
    console.log("\n=== DB'DE IMAGE YOK ===");
    // Arsive tasinmis olabilir — nopId ile ara
    const archiveDir = path.resolve(
      process.cwd(),
      "..",
      "211 urun gorselsiz",
      "archive",
      "2026-04-24",
      "orphan-images",
    );
    if (fs.existsSync(archiveDir)) {
      const nopStr = String(product.nopId);
      const matches = fs
        .readdirSync(archiveDir)
        .filter((f) => f.includes(nopStr) || f.startsWith(nopStr.padStart(7, "0")));
      console.log(`\n  Arsivde nopId=${product.nopId} esleşenler: ${matches.length}`);
      matches.slice(0, 10).forEach((f) => console.log(`    ${f}`));
    }
  }

  // Disk'te nopId ile baslayan dosyalar var mi?
  const productsDir = path.join(process.cwd(), "public", "images", "products");
  const nopStr = String(product.nopId);
  const nopPadded = nopStr.padStart(7, "0");
  const allFiles = fs.readdirSync(productsDir);
  const likelyFiles = allFiles.filter(
    (f) => f.startsWith(nopStr) || f.startsWith(nopPadded),
  );
  console.log(`\n  Disk'te nopId=${product.nopId} baslangicli dosyalar: ${likelyFiles.length}`);
  likelyFiles.slice(0, 10).forEach((f) => console.log(`    ${f}`));

  await prisma.$disconnect();
})();
