interface PriceDisplayProps {
  price: number;
  oldPrice?: number | null;
  dealerPrice?: number | null;
  discountPct?: number | null;
  size?: "sm" | "md" | "lg";
  isDealer?: boolean;
}

/**
 * Fiyatlar sistem genelinde (vitrin + bayi paneli) gizlendi — fiyat yalnız
 * admin paneli, muhasebe export ve KolayBi/fatura arka planında görünür.
 *
 * Bu bileşen geriye dönük uyumluluk için aynı prop imzasını korur ama hiçbir
 * fiyat/iskonto/etiket render etmez. Tüm storefront + dealer ürün kartı,
 * quick-view ve ürün detay sayfaları bu bileşeni kullandığından tek noktadan
 * fiyat gösterimi kaldırılmış olur.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PriceDisplay(_props: PriceDisplayProps) {
  return null;
}
