-- Review/onay akisi icin DealerDocument'a status + aciklama alanlari.
-- Mevcut tum kayitlar PENDING olarak baslar; admin review ederek APPROVED
-- veya REJECTED'a aktarir.

CREATE TYPE "DealerDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "dealer_documents"
  ADD COLUMN "status" "DealerDocumentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

CREATE INDEX "dealer_documents_status_idx" ON "dealer_documents"("status");
