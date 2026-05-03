-- KolayBi mapping ID'lerini cache'le. İlk fatura kesiminde set edilir,
-- sonrakiler bu ID'leri kullanır (rate-limit + verim için).

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN "kolaybiContactId" INTEGER;
ALTER TABLE "dealers" ADD COLUMN "kolaybiAddressId" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "kolaybiProductId" INTEGER;
