/**
 * /api/cart/refresh davranis testi (handler mantigini DB uzerinde taklit eder):
 *   1) Yayindaki urun → dondurulur (price, stock, isPublished=true)
 *   2) Gizlenmis urun (isPublished=false) → dondurulur ama isPublished=false
 *   3) Silinmis urun (DB'de yok) → response'ta yok
 *   4) Stoksuz urun → stockQuantity=0
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

(async () => {
  console.log("\n=== CART REFRESH SYNC TESTI ===\n");

  // Find a published product, a hidden product, a non-existent id
  const published = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 0 } },
  });
  const hidden = await prisma.product.findFirst({ where: { isPublished: false } });
  const outOfStock = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { lte: 0 } },
  });

  if (!published || !hidden) {
    console.log("  ✗ Test verisi yok");
    process.exit(1);
  }

  const ids = [published.id, hidden.id, "non-existent-id-123"];
  if (outOfStock) ids.push(outOfStock.id);

  // /api/cart/refresh handler'inin yapitigi sorgu:
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      stockQuantity: true,
      isPublished: true,
      publisherId: true,
      discountGroup: true,
      images: {
        select: { filename: true },
        orderBy: { displayOrder: "asc" },
        take: 1,
      },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  console.log("1) Yayindaki urun response'ta var + isPublished=true");
  const p1 = byId.get(published.id);
  check("urun dondu", p1 !== undefined);
  check("isPublished=true", p1?.isPublished === true);
  check("stockQuantity > 0", (p1?.stockQuantity ?? 0) > 0);

  console.log("\n2) Gizli urun response'ta var ama isPublished=false");
  const p2 = byId.get(hidden.id);
  check("gizli urun dondu", p2 !== undefined);
  check("isPublished=false", p2?.isPublished === false);

  console.log("\n3) Silinmis/olmayan id response'ta yok");
  check("non-existent-id dondurulmedi", byId.get("non-existent-id-123") === undefined);

  if (outOfStock) {
    console.log("\n4) Stoksuz urun stockQuantity=0");
    const p4 = byId.get(outOfStock.id);
    check("stoksuz urun dondu", p4 !== undefined);
    check("stockQuantity <= 0", (p4?.stockQuantity ?? 999) <= 0);
  }

  console.log("\n5) Client-side diff mantigi (cart-store):");
  // Simule et: client cart'inda pub=5, hidden=2, missing=1 var
  const cartBefore = [
    { productId: published.id, quantity: 2 },
    { productId: hidden.id, quantity: 1 },
    { productId: "non-existent-id-123", quantity: 3 },
  ];
  const diffs: string[] = [];
  for (const item of cartBefore) {
    const fresh = byId.get(item.productId);
    if (!fresh || !fresh.isPublished) diffs.push(`${item.productId}:removed`);
    else if (fresh.stockQuantity <= 0) diffs.push(`${item.productId}:outOfStock`);
    else if (item.quantity > fresh.stockQuantity) diffs.push(`${item.productId}:stockReduced`);
  }
  check(`Silinmis ve gizli 2 urun removed olarak isaretlendi`, diffs.length >= 2);
  check("Gizli urun 'removed' olarak isaretlendi", diffs.some((d) => d.startsWith(hidden.id) && d.endsWith("removed")));
  check("Silinmis urun 'removed' olarak isaretlendi", diffs.some((d) => d.startsWith("non-existent") && d.endsWith("removed")));

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
