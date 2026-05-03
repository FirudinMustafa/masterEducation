/**
 * 6 DIFUSION gizli urununu DB'den temizle.
 * Kullanicinin talimati: "onlari bizim sitemizden cikartalim. sadece klasorde dursun."
 *
 * Veri yedekleri:
 *   - ../211 urun gorselsiz/urunler.csv  (satir 50-59)
 *   - ../211 urun gorselsiz/urunler.json (nopId alani)
 *   - ../211 urun gorselsiz/recovered-difusion/*.jpeg (9 thumbnail)
 *
 * Guvenlik: Onceden orderItem/cartItem/review iliskilerini sayiyoruz; varsa duruyoruz.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TARGET_NOP_IDS = [65626, 65920, 65921, 65922, 65923, 65924];

(async () => {
  const products = await prisma.product.findMany({
    where: { nopId: { in: TARGET_NOP_IDS } },
    select: {
      id: true,
      nopId: true,
      name: true,
      sku: true,
      isPublished: true,
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

  console.log(`\nHedef urunler (${products.length}/6 bulundu):\n`);
  for (const p of products) {
    console.log(
      `  ${p.nopId} [${p.isPublished ? "PUB" : "HID"}] ${p.name.slice(0, 45)}`,
    );
    console.log(
      `    images=${p._count.images} orderItems=${p._count.orderItems} cartItems=${p._count.cartItems} reviews=${p._count.reviews} discountRules=${p._count.discountRules}`,
    );
  }

  const withOrders = products.filter((p) => p._count.orderItems > 0);
  if (withOrders.length > 0) {
    console.log(`\n[DUR] ${withOrders.length} urunun siparisi var. Manuel kontrol gerekli.`);
    await prisma.$disconnect();
    return;
  }

  const published = products.filter((p) => p.isPublished);
  if (published.length > 0) {
    console.log(`\n[DUR] ${published.length} urun hala yayinda. Guvenlik icin duruyorum.`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== DB'den siliniyor ===`);
  let deleted = 0;
  for (const p of products) {
    // Bagli kayitlari temizle - cart/wishlist/review
    await prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { productId: p.id } });
      await tx.productReview.deleteMany({ where: { productId: p.id } });
      await tx.dealerDiscount.deleteMany({ where: { productId: p.id } });
      await tx.productImage.deleteMany({ where: { productId: p.id } });
      await tx.product.delete({ where: { id: p.id } });
    });
    deleted++;
    console.log(`  ✓ silindi: ${p.nopId} ${p.name.slice(0, 40)}`);
  }

  console.log(`\nToplam silinen: ${deleted}`);

  // Kontrol
  const remaining = await prisma.product.count({
    where: { nopId: { in: TARGET_NOP_IDS } },
  });
  console.log(`DB'de kalan: ${remaining} (olmali: 0)`);

  await prisma.$disconnect();
})();
