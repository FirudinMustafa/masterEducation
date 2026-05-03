/**
 * Kalan ~205 gizli urunu temizle.
 * Kural: Fotografi YADA iliski datasi (order/cart/review/discount) olan urunler kalir.
 *        Hic bir iliskisi olmayanlar DB'den silinir.
 *
 * Veri kaybi riski yok: Her urunun kaydi zaten arsivlerde duruyor —
 *   - ../211 urun gorselsiz/urunler.csv
 *   - ../211 urun gorselsiz/urunler.json
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  const hidden = await prisma.product.findMany({
    where: { isPublished: false, images: { none: {} } },
    select: {
      id: true,
      nopId: true,
      name: true,
      publisher: { select: { name: true } },
      _count: {
        select: {
          images: true,
          orderItems: true,
          cartItems: true,
          reviews: true,
          discountRules: true,
        },
      },
    },
  });

  console.log(`\nGizli + imaj yok: ${hidden.length} urun\n`);

  const keep = hidden.filter(
    (p) =>
      p._count.orderItems > 0 ||
      p._count.cartItems > 0 ||
      p._count.reviews > 0 ||
      p._count.discountRules > 0,
  );
  const deletable = hidden.filter(
    (p) =>
      p._count.orderItems === 0 &&
      p._count.cartItems === 0 &&
      p._count.reviews === 0 &&
      p._count.discountRules === 0,
  );

  console.log(`Iliski/Data VAR — KALACAK : ${keep.length}`);
  console.log(`Tum iliskiler 0 — SILINECEK: ${deletable.length}\n`);

  if (keep.length > 0) {
    console.log(`── Kalacaklar (ilk 20) ──`);
    keep.slice(0, 20).forEach((p) => {
      const c = p._count;
      console.log(
        `  ${p.nopId} ${p.publisher?.name ?? "?"} : ${p.name.slice(0, 40)} ` +
          `(ord=${c.orderItems} cart=${c.cartItems} rev=${c.reviews} disc=${c.discountRules})`,
      );
    });
    if (keep.length > 20) console.log(`  ... ve ${keep.length - 20} daha`);
  }

  if (deletable.length === 0) {
    console.log("\nSilinecek bir sey yok.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== ${deletable.length} urun DB'den siliniyor ===`);

  const BATCH = 50;
  let done = 0;
  for (let i = 0; i < deletable.length; i += BATCH) {
    const batch = deletable.slice(i, i + BATCH);
    const ids = batch.map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { productId: { in: ids } } });
      await tx.productReview.deleteMany({ where: { productId: { in: ids } } });
      await tx.dealerDiscount.deleteMany({ where: { productId: { in: ids } } });
      await tx.productImage.deleteMany({ where: { productId: { in: ids } } });
      await tx.product.deleteMany({ where: { id: { in: ids } } });
    });
    done += batch.length;
    console.log(`  ${done}/${deletable.length}`);
  }

  const remaining = await prisma.product.count({
    where: { isPublished: false, images: { none: {} } },
  });
  console.log(`\nGizli+imaj yok kalan DB'de: ${remaining}`);
  console.log(`(Beklenen: ${keep.length} — iliskisi olduğu icin kalanlar)`);

  await prisma.$disconnect();
})();
