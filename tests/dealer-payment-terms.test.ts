import { describe, it, expect } from "vitest";
import { dealerStatusUpdateSchema } from "@/lib/validations";

describe("dealerStatusUpdateSchema (paymentTerms)", () => {
  it("OPEN_ACCOUNT + limit > 0 kabul", () => {
    const r = dealerStatusUpdateSchema.safeParse({
      paymentTerms: "OPEN_ACCOUNT",
      creditLimit: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("PREPAID + limit 0 kabul", () => {
    const r = dealerStatusUpdateSchema.safeParse({
      paymentTerms: "PREPAID",
      creditLimit: 0,
    });
    expect(r.success).toBe(true);
  });

  it("PREPAID + limit > 0 reddet", () => {
    const r = dealerStatusUpdateSchema.safeParse({
      paymentTerms: "PREPAID",
      creditLimit: 1000,
    });
    expect(r.success).toBe(false);
  });

  it("paymentTerms olmadan limit kabul (geriye uyum)", () => {
    const r = dealerStatusUpdateSchema.safeParse({ creditLimit: 1000 });
    expect(r.success).toBe(true);
  });

  it("notes/rejectionReason ile birlikte calisir", () => {
    const r = dealerStatusUpdateSchema.safeParse({
      paymentTerms: "PREPAID",
      creditLimit: 0,
      notes: "Pesin musteri",
    });
    expect(r.success).toBe(true);
  });
});
