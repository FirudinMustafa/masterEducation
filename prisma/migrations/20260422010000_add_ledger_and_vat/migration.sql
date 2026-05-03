-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('ORDER_DEBIT', 'ORDER_CANCEL_CREDIT', 'PAYMENT_CREDIT', 'MANUAL_ADJUSTMENT');

-- AlterTable: Order VAT total
ALTER TABLE "orders" ADD COLUMN "vatTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: OrderItem VAT breakdown
ALTER TABLE "order_items" ADD COLUMN "vatRate" DECIMAL(4,2) NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable: Dealer Ledger
CREATE TABLE "dealer_ledger" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_ledger_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "dealer_ledger_dealerId_idx" ON "dealer_ledger"("dealerId");
CREATE INDEX "dealer_ledger_orderId_idx" ON "dealer_ledger"("orderId");
CREATE INDEX "dealer_ledger_createdAt_idx" ON "dealer_ledger"("createdAt");

-- Foreign key
ALTER TABLE "dealer_ledger" ADD CONSTRAINT "dealer_ledger_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
