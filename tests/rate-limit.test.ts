import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, __resetRateLimitStore } from "@/lib/rate-limit";

beforeEach(() => {
  __resetRateLimitStore();
  vi.useRealTimers();
});

describe("rate-limit", () => {
  it("allows requests within limit", () => {
    for (let i = 0; i < 5; i++) {
      const r = rateLimit("k1", 5, 60_000);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(4 - i);
    }
  });

  it("blocks when limit exceeded", () => {
    for (let i = 0; i < 5; i++) rateLimit("k2", 5, 60_000);
    const r = rateLimit("k2", 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("separates keys", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000);
    const r = rateLimit("b", 5, 60_000);
    expect(r.allowed).toBe(true);
  });

  it("recovers after window passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));

    for (let i = 0; i < 3; i++) rateLimit("window-key", 3, 60_000);
    expect(rateLimit("window-key", 3, 60_000).allowed).toBe(false);

    vi.setSystemTime(new Date(2026, 0, 1, 12, 1, 1));
    expect(rateLimit("window-key", 3, 60_000).allowed).toBe(true);
  });
});
