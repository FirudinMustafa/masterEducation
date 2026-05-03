-- Faz 9.1: Bayi iskontolarinda CATEGORY scope ekleme
--
-- Hiyerarsi (en spesifik → en genel):
--   PRODUCT > CATEGORY > DISCOUNT_GROUP > PUBLISHER > GLOBAL
--
-- Mevcut iskontolar etkilenmez (CATEGORY scope yok, categoryId NULL).

ALTER TYPE "DiscountScope" ADD VALUE 'CATEGORY' BEFORE 'PUBLISHER';

ALTER TABLE "dealer_discounts"
  ADD COLUMN "categoryId" TEXT;

ALTER TABLE "dealer_discounts"
  ADD CONSTRAINT "dealer_discounts_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Eski unique constraint: (dealerId, scope, productId, publisherId, discountGroup)
-- Yeni: + categoryId
DROP INDEX IF EXISTS "dealer_discounts_dealerId_scope_productId_publisherId_disco_key";

CREATE UNIQUE INDEX "dealer_discounts_dealer_scope_keys_key"
  ON "dealer_discounts" ("dealerId", "scope", "productId", "categoryId", "publisherId", "discountGroup");
