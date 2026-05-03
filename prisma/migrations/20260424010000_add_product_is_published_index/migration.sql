-- Soft-delete sonrasi tum listeleme sorgulari `isPublished=true` ile filtrelenir.
-- 4898 satirda bile seq scan yapmamak ve ileride buyudukce perf sabit kalmak icin
-- composite-friendly bir partial index. Sadece gorunur urunler icin B-tree.

CREATE INDEX "products_isPublished_idx" ON "products"("isPublished");

-- Soft-delete sonrasi siralama da yaygin: isPublished + createdAt (yeni urunler),
-- isPublished + price (ucuzdan pahaliya). Bu iki composite ek.
CREATE INDEX "products_isPublished_createdAt_idx" ON "products"("isPublished", "createdAt" DESC);
CREATE INDEX "products_isPublished_price_idx" ON "products"("isPublished", "price");
