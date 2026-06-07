-- P2 (2026-06-07 audit): eksik FK/filtre index'leri.
-- Manuel uygulama: `prisma migrate deploy` (prod) veya `prisma db execute` (dev) +
-- `prisma migrate resolve --applied 20260607000000_p2_orderitem_review_indexes`.
--
-- Not: Product->Publisher/Category ilişkilerine schema'da explicit `onDelete: SetNull`
-- eklendi; bu Prisma'nın opsiyonel-ilişki default'u ile aynı olduğundan FK kısıtı
-- DDL'i değişmez (bu migration yalnız index ekler).

-- OrderItem FK kolonları: sipariş detayı orderId ile, ürün satış raporu productId ile çekilir.
CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON "order_items" ("orderId");
CREATE INDEX IF NOT EXISTS "order_items_productId_idx" ON "order_items" ("productId");

-- ProductReview userId: "Yorumlarım" + kullanıcı anonimleştirme/silme sorguları.
CREATE INDEX IF NOT EXISTS "product_reviews_userId_idx" ON "product_reviews" ("userId");
