import { UserRole, DealerStatus } from "@prisma/client";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  dealerStatus: DealerStatus | null;
  dealerId: string | null;
}

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  slug: string;
  imageSrc?: string;
  sku: string;
  stockQuantity: number;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  price: number;
  oldPrice?: number | null;
  sku: string;
  stockQuantity: number;
  hasImage: boolean;
  publisherName?: string | null;
  imageSrc?: string | null;
}
