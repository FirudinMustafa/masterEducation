-- Full-text search column + index on products.
-- Turkish dictionary ships with Postgres by default. We weight name highest,
-- then nameEn + sku, then classification fields.
ALTER TABLE "products"
ADD COLUMN "searchDoc" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('turkish', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('turkish', coalesce("nameEn", '')), 'B') ||
  setweight(to_tsvector('turkish', coalesce("sku", '')), 'B') ||
  setweight(to_tsvector('turkish', coalesce("authorCode", '')), 'C') ||
  setweight(to_tsvector('turkish', coalesce("anaTur", '')), 'C') ||
  setweight(to_tsvector('turkish', coalesce("detayTur", '')), 'C')
) STORED;

CREATE INDEX "products_searchDoc_idx" ON "products" USING GIN ("searchDoc");
