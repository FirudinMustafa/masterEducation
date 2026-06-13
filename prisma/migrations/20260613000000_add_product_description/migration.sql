-- Ürün açıklaması (2026-06-13): ürün detay sayfasındaki "Ürün Açıklaması" sekmesi
-- artık bu kolondan beslenir. Form'daki eski "Ana Tür" alanının yerini alır.
-- anaTur/detayTur kolonları DEPRECATED (formdan kaldırıldı) ama eski veriyle uyum
-- için DB'de korunur — bu migration onları DROP etmez.
--
-- Manuel uygulama: `prisma migrate deploy` (prod) veya `prisma db execute` (dev) +
-- `prisma migrate resolve --applied 20260613000000_add_product_description`.

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "description" TEXT;
