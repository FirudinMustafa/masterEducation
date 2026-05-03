-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- AlterTable: carrier snapshot on order
ALTER TABLE "orders" ADD COLUMN "trackingCarrier" TEXT;

-- CreateTable
CREATE TABLE "payment_sessions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'PENDING',
    "cardLastFour" TEXT,
    "cardBrand" TEXT,
    "processedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "payment_sessions_orderId_key" ON "payment_sessions"("orderId");
CREATE UNIQUE INDEX "payment_sessions_token_key" ON "payment_sessions"("token");
CREATE INDEX "payment_sessions_token_idx" ON "payment_sessions"("token");
CREATE INDEX "payment_sessions_expiresAt_idx" ON "payment_sessions"("expiresAt");

-- Foreign key
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
