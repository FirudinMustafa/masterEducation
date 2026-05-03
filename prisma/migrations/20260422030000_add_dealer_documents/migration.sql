-- CreateEnum
CREATE TYPE "DealerDocumentKind" AS ENUM ('TAX_CERTIFICATE', 'TRADE_REG_GAZETTE', 'SIGNATURE_CIRCULAR', 'OTHER');

-- CreateTable
CREATE TABLE "dealer_documents" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "kind" "DealerDocumentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "origName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dealer_documents_dealerId_idx" ON "dealer_documents"("dealerId");

-- AddForeignKey
ALTER TABLE "dealer_documents" ADD CONSTRAINT "dealer_documents_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
