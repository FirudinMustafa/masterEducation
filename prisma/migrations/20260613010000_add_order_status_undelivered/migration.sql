-- Sipariş durumları okultedarigim modeline geçirildi (2026-06-13).
-- Görünüm: Gelen Sipariş (PENDING+APPROVED) → Hazırlanıyor (PROCESSING) →
-- Dağıtımda (SHIPPED) → Teslim Edilemeyen (UNDELIVERED, YENİ) → Tamamlandı
-- (DELIVERED); her aşamadan İptal/İade (CANCELLED).
--
-- Enum kodları KORUNDU (PENDING/APPROVED/... aynı) — yalnız etiketler değişti ve
-- tek YENİ değer 'UNDELIVERED' eklendi. Bu yüzden mevcut sipariş verisinde
-- BACKFILL GEREKMEZ. Eklenen değer aynı transaction içinde kullanılmadığından
-- ADD VALUE güvenlidir.
--
-- Manuel uygulama: `prisma migrate deploy` (prod) + resolve.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'UNDELIVERED' BEFORE 'DELIVERED';
ALTER TYPE "OrderEventType" ADD VALUE IF NOT EXISTS 'UNDELIVERED' BEFORE 'DELIVERED';
