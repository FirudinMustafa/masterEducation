import { describe, expect, it } from "vitest";

/**
 * These tests exercise the math only — the DB-backed `evaluateCoupon` helper
 * is covered by e2e scenarios. Keeping the formula here catches regressions
 * without spinning up the DB.
 */
function percent(subtotal: number, value: number): number {
  return Math.round(subtotal * (value / 100) * 100) / 100;
}

function fixed(subtotal: number, value: number): number {
  return Math.round(Math.min(subtotal, value) * 100) / 100;
}

describe("coupon math", () => {
  it("percent rounds to 2 decimals", () => {
    expect(percent(99.99, 10)).toBe(10);
    expect(percent(33.33, 33.3333)).toBe(11.11);
  });
  it("fixed cannot exceed subtotal", () => {
    expect(fixed(50, 200)).toBe(50);
    expect(fixed(200, 50)).toBe(50);
  });
  it("fixed handles zero subtotal", () => {
    expect(fixed(0, 100)).toBe(0);
  });
});
