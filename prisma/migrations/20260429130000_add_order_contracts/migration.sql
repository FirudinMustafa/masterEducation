-- Mesafeli satis sozlesmesi + on bilgilendirme formu onay kaydi.
-- Siparis verirken zorunlu kanit (KVKK + Tuketici Kanunu m.48 cerceve).

ALTER TABLE "orders"
  ADD COLUMN "contractsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "contractsAcceptedIp" TEXT;

-- OrderEvent'e yeni event turu ekle (DB seviyesinde audit izi).
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'CONTRACTS_ACCEPTED';
