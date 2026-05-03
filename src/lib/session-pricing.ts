import { auth } from "@/lib/auth";
import {
  calculateDealerPrice,
  getDealerDiscountRules,
  type DiscountRuleInput,
} from "@/lib/pricing";

export type SessionPricingContext = {
  dealerId: string | null;
  rules: DiscountRuleInput[];
};

export async function getSessionPricingContext(): Promise<SessionPricingContext> {
  const session = await auth();
  if (
    session?.user?.role !== "DEALER" ||
    session.user.dealerStatus !== "APPROVED" ||
    !session.user.dealerId
  ) {
    return { dealerId: null, rules: [] };
  }
  const rules = await getDealerDiscountRules(session.user.dealerId);
  return { dealerId: session.user.dealerId, rules };
}

export function applyDealerPricing<
  T extends {
    id: string;
    price: number;
    categoryId: string | null;
    publisherId: string | null;
    discountGroup: string | null;
  }
>(
  products: T[],
  ctx: SessionPricingContext
): (T & { dealerPrice: number | null; dealerDiscountPct: number | null })[] {
  if (!ctx.dealerId) {
    return products.map((p) => ({
      ...p,
      dealerPrice: null,
      dealerDiscountPct: null,
    }));
  }
  return products.map((p) => {
    const pricing = calculateDealerPrice(p, ctx.rules);
    const hasDiscount = pricing.discountPct > 0;
    return {
      ...p,
      dealerPrice: hasDiscount ? pricing.dealerPrice : null,
      dealerDiscountPct: hasDiscount ? pricing.discountPct : null,
    };
  });
}
