import type { DealerDiscount, DiscountScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PricedProductInput = {
  id: string;
  price: number;
  categoryId: string | null;
  publisherId: string | null;
  discountGroup: string | null;
};

export type DiscountRuleInput = Pick<
  DealerDiscount,
  "scope" | "discountPct" | "productId" | "categoryId" | "publisherId" | "discountGroup"
>;

export type DealerPricing = {
  listPrice: number;
  discountPct: number;
  dealerPrice: number;
  matchedScope: DiscountScope | null;
};

// Hiyerarsi: en spesifik → en genel.
// CATEGORY, urun-koleksiyonu bazli (orn. "ogretmen kitaplari") iskonto;
// DISCOUNT_GROUP yayinevi-ici alt grup; PUBLISHER yayinevi geneli.
const SCOPE_PRIORITY: Record<DiscountScope, number> = {
  PRODUCT: 1,
  CATEGORY: 2,
  DISCOUNT_GROUP: 3,
  PUBLISHER: 4,
  GLOBAL: 5,
};

export function pickBestRule(
  product: PricedProductInput,
  rules: DiscountRuleInput[]
): DiscountRuleInput | null {
  const applicable = rules.filter((r) => {
    switch (r.scope) {
      case "PRODUCT":
        return r.productId === product.id;
      case "CATEGORY":
        return !!product.categoryId && r.categoryId === product.categoryId;
      case "DISCOUNT_GROUP":
        return !!product.discountGroup && r.discountGroup === product.discountGroup;
      case "PUBLISHER":
        return !!product.publisherId && r.publisherId === product.publisherId;
      case "GLOBAL":
        return true;
      default:
        return false;
    }
  });

  if (applicable.length === 0) return null;

  applicable.sort((a, b) => SCOPE_PRIORITY[a.scope] - SCOPE_PRIORITY[b.scope]);
  return applicable[0];
}

export function calculateDealerPrice(
  product: PricedProductInput,
  rules: DiscountRuleInput[]
): DealerPricing {
  const listPrice = Number(product.price);
  const best = pickBestRule(product, rules);

  if (!best) {
    return { listPrice, discountPct: 0, dealerPrice: listPrice, matchedScope: null };
  }

  const pct = Number(best.discountPct);
  const dealerPrice = Math.round(listPrice * (1 - pct / 100) * 100) / 100;

  return {
    listPrice,
    discountPct: pct,
    dealerPrice,
    matchedScope: best.scope,
  };
}

export async function getDealerDiscountRules(dealerId: string): Promise<DiscountRuleInput[]> {
  const rules = await prisma.dealerDiscount.findMany({
    where: { dealerId },
    select: {
      scope: true,
      discountPct: true,
      productId: true,
      categoryId: true,
      publisherId: true,
      discountGroup: true,
    },
  });
  return rules;
}

export async function priceProductsForDealer(
  productIds: string[],
  dealerId: string | null
): Promise<Map<string, DealerPricing>> {
  if (productIds.length === 0) return new Map();

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, categoryId: true, publisherId: true, discountGroup: true },
  });

  const rules = dealerId ? await getDealerDiscountRules(dealerId) : [];
  const map = new Map<string, DealerPricing>();

  for (const p of products) {
    const pricing = calculateDealerPrice(
      {
        id: p.id,
        price: Number(p.price),
        categoryId: p.categoryId,
        publisherId: p.publisherId,
        discountGroup: p.discountGroup,
      },
      rules
    );
    map.set(p.id, pricing);
  }

  return map;
}
