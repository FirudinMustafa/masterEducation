-- CargoCarrier enum
CREATE TYPE "CargoCarrier" AS ENUM (
  'ARAS',
  'YURTICI',
  'MNG',
  'PTT',
  'SURAT',
  'KOLAY_GELSIN',
  'HEPSIJET',
  'TRENDYOL',
  'OTHER'
);

-- OrderEventType enum
CREATE TYPE "OrderEventType" AS ENUM (
  'CREATED',
  'APPROVED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'NOTE'
);

-- Eski trackingCarrier (TEXT) yerine enum kullanmak icin gecis:
-- 1) Yeni gecici kolon, varolan text'i OTHER + trackingCarrierName olarak tasi.
ALTER TABLE "orders"
  ADD COLUMN "trackingCarrierName" TEXT,
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "estimatedDeliveryAt" TIMESTAMP(3);

-- Eski trackingCarrier (TEXT) degerini trackingCarrierName'e kopyala.
UPDATE "orders"
   SET "trackingCarrierName" = "trackingCarrier"
 WHERE "trackingCarrier" IS NOT NULL;

-- Eski TEXT kolonu kaldir ve enum olarak yeniden ekle.
ALTER TABLE "orders" DROP COLUMN "trackingCarrier";
ALTER TABLE "orders" ADD COLUMN "trackingCarrier" "CargoCarrier";

-- Varolan siparislerde trackingCarrierName dolu ise bilinen mapleri at,
-- degilse OTHER olarak isaretle (isim zaten trackingCarrierName'de duruyor).
UPDATE "orders"
   SET "trackingCarrier" = CASE
     WHEN "trackingCarrierName" ILIKE 'aras%'           THEN 'ARAS'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'yurtici%'        THEN 'YURTICI'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'mng%'            THEN 'MNG'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'ptt%'            THEN 'PTT'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'surat%'          THEN 'SURAT'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE '%kolay gelsin%'  THEN 'KOLAY_GELSIN'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'hepsijet%'       THEN 'HEPSIJET'::"CargoCarrier"
     WHEN "trackingCarrierName" ILIKE 'trendyol%'       THEN 'TRENDYOL'::"CargoCarrier"
     WHEN "trackingCarrierName" IS NOT NULL             THEN 'OTHER'::"CargoCarrier"
     ELSE NULL
   END;

-- DELIVERED statu icin deliveredAt'i updatedAt ile doldur (eski siparisler icin).
UPDATE "orders"
   SET "deliveredAt" = "updatedAt"
 WHERE "status" = 'DELIVERED' AND "deliveredAt" IS NULL;

-- OrderEvent tablosu
CREATE TABLE "order_events" (
  "id"        TEXT NOT NULL,
  "orderId"   TEXT NOT NULL,
  "type"      "OrderEventType" NOT NULL,
  "note"      TEXT,
  "actorId"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_events_orderId_createdAt_idx"
  ON "order_events"("orderId", "createdAt");

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
