import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as fs from "fs";
import * as path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const hidden = await prisma.product.findMany({
    where: { isPublished: false },
    select: { nopId: true, name: true, publisher: { select: { name: true } } },
  });

  const csv = fs.readFileSync(
    path.resolve(__dirname, "..", "..", "ProductMapping.csv"),
    "utf8",
  );
  const nopIdsWithMapping = new Set<number>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const parts = line.split(";");
    const nopId = Number(parts[1]);
    const pictureId = Number(parts[2]);
    if (Number.isFinite(nopId) && Number.isFinite(pictureId)) {
      nopIdsWithMapping.add(nopId);
    }
  }

  const withMapping = hidden.filter((h) => nopIdsWithMapping.has(h.nopId));
  const withoutMapping = hidden.filter((h) => !nopIdsWithMapping.has(h.nopId));

  console.log(`Gizli urun: ${hidden.length}`);
  console.log(`  CSV'de picture eslestirmesi olanlar: ${withMapping.length}`);
  console.log(`  CSV'de hic eslestirme olmayan: ${withoutMapping.length}`);

  if (withMapping.length > 0) {
    console.log("\nCSV eslestirmesi olan gizli urunler:");
    withMapping.slice(0, 10).forEach((p) =>
      console.log(`  ${p.nopId} ${p.publisher?.name ?? "?"} : ${p.name.slice(0, 50)}`),
    );
  }

  await prisma.$disconnect();
})();
