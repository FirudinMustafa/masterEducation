-- Bölüm 3 P2/P3 batch fix: Order soft-delete + 6 index ekle.
-- Manuel uygulama: `prisma migrate deploy` (prod) veya `prisma db execute` (dev) +
-- `prisma migrate resolve --applied 20260506190000_p2_p3_indexes_and_order_softdelete`.

-- P2-DB-2: Order soft-delete column + index (Türkiye 10 yıl saklama).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "orders_deletedAt_idx" ON "orders" ("deletedAt");

-- P2-DB-3: DealerLedger composite — bayi statement (`WHERE dealerId ORDER BY createdAt DESC`).
CREATE INDEX IF NOT EXISTS "dealer_ledger_dealerId_createdAt_idx"
  ON "dealer_ledger" ("dealerId", "createdAt" DESC);

-- P3-DB-1: AuditLog action filter (admin "filter by action").
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");

-- P3-DB-2: ProductReview composite (admin per-product moderation).
CREATE INDEX IF NOT EXISTS "product_reviews_productId_status_idx"
  ON "product_reviews" ("productId", "status");

-- P3-DB-3: OrderEvent actorId index (admin timeline "who did what").
CREATE INDEX IF NOT EXISTS "order_events_actorId_idx" ON "order_events" ("actorId");

-- P3-DB-4: Dealer status index (admin dashboard `WHERE status=APPROVED`).
CREATE INDEX IF NOT EXISTS "dealers_status_idx" ON "dealers" ("status");
