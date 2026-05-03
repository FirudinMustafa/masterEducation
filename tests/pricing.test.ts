import { describe, expect, it } from "vitest";
import {
  calculateDealerPrice,
  pickBestRule,
  type DiscountRuleInput,
  type PricedProductInput,
} from "@/lib/pricing";

type RuleInit = {
  scope: DiscountRuleInput["scope"];
  discountPct: number;
  productId?: string | null;
  categoryId?: string | null;
  publisherId?: string | null;
  discountGroup?: string | null;
};

function rule(init: RuleInit): DiscountRuleInput {
  // Prisma decimal field is runtime-coerced via Number() in pricing.ts,
  // so we can safely cast a plain number for test purposes.
  return {
    productId: init.productId ?? null,
    categoryId: init.categoryId ?? null,
    publisherId: init.publisherId ?? null,
    discountGroup: init.discountGroup ?? null,
    scope: init.scope,
    discountPct: init.discountPct as unknown as DiscountRuleInput["discountPct"],
  };
}

const product: PricedProductInput = {
  id: "p1",
  price: 100,
  categoryId: "cat1",
  publisherId: "pub1",
  discountGroup: "GRP-A",
};

describe("pricing engine", () => {
  it("returns list price when dealer has no rules", () => {
    const result = calculateDealerPrice(product, []);
    expect(result.dealerPrice).toBe(100);
    expect(result.discountPct).toBe(0);
    expect(result.matchedScope).toBeNull();
  });

  it("applies GLOBAL rule when only global exists", () => {
    const rules = [rule({ scope: "GLOBAL", discountPct: 10 })];
    const result = calculateDealerPrice(product, rules);
    expect(result.dealerPrice).toBe(90);
    expect(result.matchedScope).toBe("GLOBAL");
  });

  it("prefers PRODUCT over CATEGORY/DISCOUNT_GROUP/PUBLISHER/GLOBAL", () => {
    const rules = [
      rule({ scope: "GLOBAL", discountPct: 5 }),
      rule({ scope: "PUBLISHER", publisherId: "pub1", discountPct: 15 }),
      rule({ scope: "DISCOUNT_GROUP", discountGroup: "GRP-A", discountPct: 20 }),
      rule({ scope: "CATEGORY", categoryId: "cat1", discountPct: 22 }),
      rule({ scope: "PRODUCT", productId: "p1", discountPct: 25 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("PRODUCT");
    expect(result.dealerPrice).toBe(75);
  });

  it("prefers CATEGORY over DISCOUNT_GROUP/PUBLISHER/GLOBAL when no PRODUCT rule", () => {
    const rules = [
      rule({ scope: "GLOBAL", discountPct: 5 }),
      rule({ scope: "PUBLISHER", publisherId: "pub1", discountPct: 15 }),
      rule({ scope: "DISCOUNT_GROUP", discountGroup: "GRP-A", discountPct: 20 }),
      rule({ scope: "CATEGORY", categoryId: "cat1", discountPct: 22 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("CATEGORY");
    expect(result.dealerPrice).toBe(78);
  });

  it("prefers DISCOUNT_GROUP over PUBLISHER/GLOBAL when no PRODUCT/CATEGORY rule", () => {
    const rules = [
      rule({ scope: "GLOBAL", discountPct: 5 }),
      rule({ scope: "PUBLISHER", publisherId: "pub1", discountPct: 15 }),
      rule({ scope: "DISCOUNT_GROUP", discountGroup: "GRP-A", discountPct: 20 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("DISCOUNT_GROUP");
    expect(result.dealerPrice).toBe(80);
  });

  it("ignores CATEGORY rule when product has no category", () => {
    const noCat = { ...product, categoryId: null };
    const rules = [
      rule({ scope: "CATEGORY", categoryId: "cat1", discountPct: 50 }),
      rule({ scope: "GLOBAL", discountPct: 10 }),
    ];
    const result = calculateDealerPrice(noCat, rules);
    expect(result.matchedScope).toBe("GLOBAL");
  });

  it("ignores CATEGORY rule for a different category", () => {
    const rules = [
      rule({ scope: "CATEGORY", categoryId: "cat-other", discountPct: 50 }),
      rule({ scope: "GLOBAL", discountPct: 10 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("GLOBAL");
  });

  it("prefers PUBLISHER over GLOBAL", () => {
    const rules = [
      rule({ scope: "GLOBAL", discountPct: 5 }),
      rule({ scope: "PUBLISHER", publisherId: "pub1", discountPct: 12 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("PUBLISHER");
    expect(result.dealerPrice).toBe(88);
  });

  it("ignores PRODUCT rule for a different product", () => {
    const rules = [
      rule({ scope: "PRODUCT", productId: "other", discountPct: 50 }),
      rule({ scope: "GLOBAL", discountPct: 10 }),
    ];
    const result = calculateDealerPrice(product, rules);
    expect(result.matchedScope).toBe("GLOBAL");
    expect(result.dealerPrice).toBe(90);
  });

  it("ignores DISCOUNT_GROUP rule when product has no group", () => {
    const noGroup = { ...product, discountGroup: null };
    const rules = [
      rule({ scope: "DISCOUNT_GROUP", discountGroup: "GRP-A", discountPct: 50 }),
      rule({ scope: "GLOBAL", discountPct: 10 }),
    ];
    const result = calculateDealerPrice(noGroup, rules);
    expect(result.matchedScope).toBe("GLOBAL");
  });

  it("rounds dealerPrice to 2 decimals", () => {
    const rules = [rule({ scope: "GLOBAL", discountPct: 33.333 })];
    const result = calculateDealerPrice(product, rules);
    expect(result.dealerPrice).toBe(66.67);
  });

  it("pickBestRule returns null for no applicable rules", () => {
    const best = pickBestRule(product, [
      rule({ scope: "PRODUCT", productId: "other", discountPct: 50 }),
    ]);
    expect(best).toBeNull();
  });

  it("handles 0% discount rule", () => {
    const rules = [rule({ scope: "GLOBAL", discountPct: 0 })];
    const result = calculateDealerPrice(product, rules);
    expect(result.dealerPrice).toBe(100);
    expect(result.discountPct).toBe(0);
    expect(result.matchedScope).toBe("GLOBAL");
  });

  it("handles 100% discount rule (free)", () => {
    const rules = [rule({ scope: "PRODUCT", productId: "p1", discountPct: 100 })];
    const result = calculateDealerPrice(product, rules);
    expect(result.dealerPrice).toBe(0);
  });
});
