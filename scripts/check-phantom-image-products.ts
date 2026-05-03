/**
 * "Phantom image" urunleri: hasImage=true ama ProductImage kaydi yok.
 * Bu urunler storefront'ta kirilmis placeholder gosterir (seed mismatch).
 * Kontrol + isteğe bağlı fix.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const FIX = process.argv.includes("--fix");

(async () => {
  // isPublished=true + hasImage=true ama ProductImage yok olanlar
  const phantoms = await prisma.product.findMany({
    where: {
      isPublished: true,
      images: { none: {} },
    },
    select: {
      id: true,
      nopId: true,
      name: true,
      slug: true,
      hasImage: true,
      publisher: { select: { name: true } },
    },
  });

  console.log(`\n=== PHANTOM IMAGE URUNLERI (yayinda + image kaydi yok) ===\n`);
  console.log(`Toplam: ${phantoms.length}\n`);

  if (phantoms.length === 0) {
    console.log("Yok. Hepsi dogru.");
    await prisma.$disconnect();
    return;
  }

  // Yayinevi dagilimi
  const byPub = new Map<string, number>();
  for (const p of phantoms) {
    const pub = p.publisher?.name ?? "(yok)";
    byPub.set(pub, (byPub.get(pub) ?? 0) + 1);
  }
  console.log("Yayinevi dagilimi:");
  for (const [pub, c] of [...byPub.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${pub.padEnd(20)} ${c}`);
  }

  console.log("\nIlk 10 urun:");
  phantoms.slice(0, 10).forEach((p) => {
    console.log(`  nopId=${p.nopId}  hasImage=${p.hasImage}  ${p.name.slice(0, 60)}`);
  });

  if (FIX) {
    console.log(`\n--fix modu: hepsi isPublished=false yapiliyor...`);
    const res = await prisma.product.updateMany({
      where: { id: { in: phantoms.map((p) => p.id) } },
      data: { isPublished: false, hasImage: false },
    });
    console.log(`${res.count} urun gizlendi (isPublished=false).`);
  } else {
    console.log(`\n(--fix eklenirse bu urunler gizlenir. Simdi sadece raporlandi.)`);
  }

  await prisma.$disconnect();
})();
