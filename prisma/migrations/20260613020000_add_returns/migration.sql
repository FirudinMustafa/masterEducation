-- Bayi İade sistemi (2026-06-13): bayiler teslim aldıkları siparişlerden ürün
-- iadesi talep edebilir; admin onaylayınca stok geri eklenir ve açık hesap
-- bayisinin carisine RETURN_CREDIT alacağı yazılır.
--
-- Manuel uygulama: `prisma migrate deploy` (prod) + resolve.

-- ReturnStatus enum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- LedgerKind: iade alacağı (additive — aynı tx içinde kullanılmaz, güvenli)
ALTER TYPE "LedgerKind" ADD VALUE IF NOT EXISTS 'RETURN_CREDIT';

-- returns tablosu
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "adminNote" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "returns_returnNumber_key" ON "returns"("returnNumber");
CREATE INDEX "returns_dealerId_idx" ON "returns"("dealerId");
CREATE INDEX "returns_orderId_idx" ON "returns"("orderId");
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- return_items tablosu
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "productName" TEXT NOT NULL,
    "productSku" TEXT NOT NULL,
    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");
CREATE INDEX "return_items_productId_idx" ON "return_items"("productId");

-- Foreign keys
ALTER TABLE "returns" ADD CONSTRAINT "returns_dealerId_fkey"
    FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "returns" ADD CONSTRAINT "returns_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
