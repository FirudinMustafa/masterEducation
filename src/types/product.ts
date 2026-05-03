export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  oldPrice?: number | null;
  dealerPrice?: number | null;
  dealerDiscountPct?: number | null;
  stockQuantity: number;
  hasImage: boolean;
  publisherName?: string | null;
  imageSrc?: string | null;
  avgRating?: number | null;
  reviewCount?: number;
  /** ISO timestamp (string or Date) used to decide "Yeni" badge. */
  createdAt?: string | Date | null;
}
