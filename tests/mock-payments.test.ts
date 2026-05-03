import { describe, expect, it } from "vitest";
import { isMockPaymentsAllowed } from "@/lib/env";

describe("mock 3D payments — prod guard", () => {
  it("allowed in development by default", () => {
    expect(isMockPaymentsAllowed("development", false)).toBe(true);
    expect(isMockPaymentsAllowed("development", true)).toBe(true);
  });

  it("allowed in test by default", () => {
    expect(isMockPaymentsAllowed("test", false)).toBe(true);
  });

  it("blocked in production by default", () => {
    expect(isMockPaymentsAllowed("production", false)).toBe(false);
  });

  it("can be explicitly enabled in production (e.g. staging)", () => {
    expect(isMockPaymentsAllowed("production", true)).toBe(true);
  });
});
