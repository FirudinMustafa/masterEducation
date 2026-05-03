import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/Ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/İ/g, "i")
    .replace(/Ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanNull(val: string | undefined | null): string | null {
  if (!val || val === "NULL" || val.trim() === "") return null;
  return val.trim();
}

async function main() {
  console.log("Seed basliyor...");

  // Read CSV files
  const projectRoot = path.resolve(__dirname, "..");
  const dataDir = path.resolve(projectRoot, "..", ""); // parent dir where CSVs are

  const productCsvPath = fs.existsSync(path.join(dataDir, "Prdocut.csv"))
    ? path.join(dataDir, "Prdocut.csv")
    : path.join(projectRoot, "data", "Prdocut.csv");

  const mappingCsvPath = fs.existsSync(path.join(dataDir, "ProductMapping.csv"))
    ? path.join(dataDir, "ProductMapping.csv")
    : path.join(projectRoot, "data", "ProductMapping.csv");

  console.log("Product CSV:", productCsvPath);
  console.log("Mapping CSV:", mappingCsvPath);

  // Parse product CSV
  const productRaw = fs.readFileSync(productCsvPath, "utf-8").replace(/^\uFEFF/, "");
  const productRows: Record<string, string>[] = parse(productRaw, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Toplam CSV satiri: ${productRows.length}`);

  // Filter: Published=1, Deleted=0, Price>0
  const activeProducts = productRows.filter((row: Record<string, string>) => {
    const published = row["Published"]?.trim();
    const deleted = row["Deleted"]?.trim();
    const price = parseFloat(row["Price"] || "0");
    return published === "1" && deleted === "0" && price > 0;
  });

  console.log(`Aktif urun sayisi: ${activeProducts.length}`);

  // Extract unique publishers from Author column
  const publisherNames = new Set<string>();
  for (const row of activeProducts) {
    const author = cleanNull(row["Author"]);
    if (author) publisherNames.add(author);
  }

  console.log(`Yayinevi sayisi: ${publisherNames.size}`);

  // Create publishers
  const publisherMap = new Map<string, string>();
  for (const name of publisherNames) {
    const slug = slugify(name) || name.toLowerCase().replace(/\s+/g, "-");
    const pub = await prisma.publisher.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
    publisherMap.set(name, pub.id);
  }

  // Extract unique categories from AnaTur
  const categoryNames = new Set<string>();
  for (const row of activeProducts) {
    const anaTur = cleanNull(row["AnaTur"]);
    if (anaTur) categoryNames.add(anaTur);
  }

  console.log(`Kategori sayisi: ${categoryNames.size}`);

  const categoryMap = new Map<string, string>();
  for (const name of categoryNames) {
    const slug = slugify(name) || name.toLowerCase().replace(/\s+/g, "-");
    const cat = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug, type: "ana" },
    });
    categoryMap.set(name, cat.id);
  }

  // Create products in batches
  console.log("Urunler olusturuluyor...");
  let created = 0;
  let skipped = 0;

  for (const row of activeProducts) {
    const nopId = parseInt(row["Id"]);
    const name = row["Name"]?.trim() || `Urun-${nopId}`;
    const sku = row["Sku"]?.trim() || String(nopId);
    const price = parseFloat(row["Price"] || "0");
    const oldPrice = parseFloat(row["OldPrice"] || "0");
    const stockQty = parseInt(row["StockQuantity"] || "0");
    const author = cleanNull(row["Author"]);
    const anaTur = cleanNull(row["AnaTur"]);
    const detayTur = cleanNull(row["DetayTur"]);
    const language = cleanNull(row["SPECODE"]);
    const productType = cleanNull(row["SPECODE4"]);
    const discountGroup = cleanNull(row["IskontoGrubu"]);
    const nameEn = cleanNull(row["NameEn"]);
    const vatRateStr = cleanNull(row["VatRate"]);
    const vatRate = vatRateStr ? parseFloat(vatRateStr) : 0;

    const slug = `${slugify(name)}-${nopId}`;

    try {
      await prisma.product.upsert({
        where: { nopId },
        update: {
          name,
          price,
          oldPrice: oldPrice > 0 ? oldPrice : null,
          stockQuantity: stockQty,
          isPublished: true,
        },
        create: {
          nopId,
          name,
          nameEn,
          slug,
          sku,
          price,
          oldPrice: oldPrice > 0 ? oldPrice : null,
          vatRate,
          stockQuantity: stockQty,
          publisherId: author ? publisherMap.get(author) || null : null,
          categoryId: anaTur ? categoryMap.get(anaTur) || null : null,
          anaTur,
          detayTur,
          language,
          productType,
          discountGroup,
          authorCode: author,
          isPublished: true,
          hasImage: false,
        },
      });
      created++;
    } catch (err) {
      skipped++;
      if (skipped <= 5) console.error(`Urun atlandi (nopId: ${nopId}):`, (err as Error).message);
    }

    if (created % 500 === 0 && created > 0) {
      console.log(`  ${created} urun olusturuldu...`);
    }
  }

  console.log(`Urunler tamamlandi: ${created} olusturuldu, ${skipped} atlandi`);

  // Parse mapping CSV
  const mappingRaw = fs.readFileSync(mappingCsvPath, "utf-8").replace(/^\uFEFF/, "");
  const mappingRows: Record<string, string>[] = parse(mappingRaw, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Gorsel eslestirme satiri: ${mappingRows.length}`);

  // Build nopId -> product id map
  const allProducts = await prisma.product.findMany({ select: { id: true, nopId: true } });
  const nopToId = new Map<number, string>();
  for (const p of allProducts) {
    nopToId.set(p.nopId, p.id);
  }

  let imageCount = 0;
  let imageSkipped = 0;
  const productsWithImages = new Set<string>();

  for (const row of mappingRows) {
    const productId = parseInt(row["ProductId"]);
    const pictureId = parseInt(row["PictureId"]);
    const displayOrder = parseInt(row["DisplayOrder"] || "0");
    const barcode = cleanNull(row["Barcode"])?.replace(/\.$/, "") || null;

    const dbProductId = nopToId.get(productId);
    if (!dbProductId) {
      imageSkipped++;
      continue;
    }

    const filename = String(pictureId).padStart(7, "0") + ".png";

    try {
      await prisma.productImage.upsert({
        where: {
          productId_pictureId: { productId: dbProductId, pictureId },
        },
        update: { displayOrder, barcode },
        create: {
          productId: dbProductId,
          pictureId,
          filename,
          displayOrder,
          barcode,
        },
      });
      imageCount++;
      productsWithImages.add(dbProductId);
    } catch {
      imageSkipped++;
    }

    if (imageCount % 1000 === 0 && imageCount > 0) {
      console.log(`  ${imageCount} gorsel eslestirmesi olusturuldu...`);
    }
  }

  console.log(`Gorseller: ${imageCount} olusturuldu, ${imageSkipped} atlandi`);

  // Update hasImage flag
  if (productsWithImages.size > 0) {
    await prisma.product.updateMany({
      where: { id: { in: Array.from(productsWithImages) } },
      data: { hasImage: true },
    });
    console.log(`${productsWithImages.size} urunde hasImage=true olarak guncellendi`);
  }

  // Report missing images
  const missingImageProducts = await prisma.product.findMany({
    where: { hasImage: false, isPublished: true },
    select: { nopId: true, name: true, sku: true },
    orderBy: { nopId: "asc" },
  });

  console.log(`\nGorseli olmayan urun sayisi: ${missingImageProducts.length}`);

  // Write missing images report
  const docsDir = path.join(projectRoot, "docs");
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const report = [
    "# Gorseli Eksik Urunler",
    "",
    `Toplam: ${missingImageProducts.length} urun`,
    "",
    "| NopId | Urun Adi | SKU |",
    "|---|---|---|",
    ...missingImageProducts.map(
      (p) => `| ${p.nopId} | ${p.name} | ${p.sku} |`
    ),
  ].join("\n");

  fs.writeFileSync(path.join(docsDir, "MISSING_IMAGES.md"), report, "utf-8");
  console.log("docs/MISSING_IMAGES.md olusturuldu");

  // Create admin user
  const bcrypt = await import("bcryptjs");
  const cryptoMod = await import("crypto");

  // Production'da SEED_ADMIN_PASSWORD set edilmeli; yoksa rastgele guclu
  // parola uretilir ve console'a basilir (bir kereligine gorulur, sonra kayip).
  const envPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
  const adminPassword =
    envPassword && envPassword.length >= 12
      ? envPassword
      : cryptoMod.randomBytes(18).toString("base64url");
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const existing = await prisma.user.findUnique({
    where: { email: "admin@mastereducation.com.tr" },
    select: { id: true },
  });

  await prisma.user.upsert({
    where: { email: "admin@mastereducation.com.tr" },
    update: envPassword ? { passwordHash: adminHash } : {},
    create: {
      email: "admin@mastereducation.com.tr",
      passwordHash: adminHash,
      name: "Admin",
      role: "ADMIN",
    },
  });

  if (existing && !envPassword) {
    console.log(
      "Admin zaten var, parola degistirilmedi (SEED_ADMIN_PASSWORD set degildi)."
    );
  } else if (envPassword) {
    console.log(
      "Admin kullanici olusturuldu/guncellendi: admin@mastereducation.com.tr (parola SEED_ADMIN_PASSWORD env'den)."
    );
  } else {
    console.log("─────────────────────────────────────────────────────────");
    console.log("Admin kullanici olusturuldu:");
    console.log("  Email   : admin@mastereducation.com.tr");
    console.log(`  Parola  : ${adminPassword}`);
    console.log("Bu parolayi simdi kaydedin — bir daha gosterilmeyecek.");
    console.log("Production'da SEED_ADMIN_PASSWORD env'i ile sabitleyin.");
    console.log("─────────────────────────────────────────────────────────");
  }

  console.log("\nSeed tamamlandi!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
