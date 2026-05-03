import { describe, expect, it } from "vitest";
import {
  detectBrand,
  luhnValid,
  normalizeCard,
  lastFour,
  validExpiry,
} from "@/lib/card";

describe("card helpers", () => {
  it("normalizes spaces and dashes", () => {
    expect(normalizeCard("4111 1111-1111 1111")).toBe("4111111111111111");
  });

  it("detects VISA", () => {
    expect(detectBrand("4111111111111111")).toBe("VISA");
  });

  it("detects MASTERCARD (51-55 and 22-27 ranges)", () => {
    expect(detectBrand("5555555555554444")).toBe("MASTERCARD");
    expect(detectBrand("2221000000000009")).toBe("MASTERCARD");
  });

  it("detects AMEX", () => {
    expect(detectBrand("378282246310005")).toBe("AMEX");
  });

  it("returns UNKNOWN for unrecognized BIN", () => {
    expect(detectBrand("6011111111111117")).toBe("UNKNOWN");
  });

  it("luhnValid accepts a real test number", () => {
    // Visa test number from Stripe's fixtures.
    expect(luhnValid("4242424242424242")).toBe(true);
  });

  it("luhnValid rejects an invalid number", () => {
    expect(luhnValid("4242424242424241")).toBe(false);
  });

  it("lastFour returns the tail", () => {
    expect(lastFour("4242424242424242")).toBe("4242");
  });

  describe("validExpiry", () => {
    it("accepts future months in MM/YY", () => {
      const next = new Date();
      next.setFullYear(next.getFullYear() + 2);
      const mm = String(next.getMonth() + 1).padStart(2, "0");
      const yy = String(next.getFullYear() % 100).padStart(2, "0");
      expect(validExpiry(`${mm}/${yy}`)).toBe(true);
    });
    it("rejects past months", () => {
      expect(validExpiry("01/20")).toBe(false);
    });
    it("rejects invalid month", () => {
      expect(validExpiry("13/99")).toBe(false);
    });
    it("rejects garbage", () => {
      expect(validExpiry("abc")).toBe(false);
      expect(validExpiry("1225")).toBe(false);
    });
  });
});
