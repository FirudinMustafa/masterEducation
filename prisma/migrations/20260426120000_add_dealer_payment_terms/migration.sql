-- Faz 8.1: Bayi odeme yontemi (admin tanimli)
--   OPEN_ACCOUNT  → cari (kredi limiti) — siparis verir, sonradan oder
--   PREPAID       → pesin (kredi karti / havale) — her siparis aninda oder
--
-- Mevcut bayilerin davranisi degismesin: default OPEN_ACCOUNT.

CREATE TYPE "DealerPaymentTerms" AS ENUM ('OPEN_ACCOUNT', 'PREPAID');

ALTER TABLE "dealers"
  ADD COLUMN "paymentTerms" "DealerPaymentTerms" NOT NULL DEFAULT 'OPEN_ACCOUNT';
