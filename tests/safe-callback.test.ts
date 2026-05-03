import { describe, it, expect } from "vitest";
import { safeCallbackUrl } from "@/lib/safe-callback";

describe("safeCallbackUrl", () => {
  it("relative path → kabul", () => {
    expect(safeCallbackUrl("/")).toBe("/");
    expect(safeCallbackUrl("/hesabim")).toBe("/hesabim");
    expect(safeCallbackUrl("/urunler/abc?x=1")).toBe("/urunler/abc?x=1");
  });

  it("null/empty/undefined → fallback", () => {
    expect(safeCallbackUrl(null)).toBe("/");
    expect(safeCallbackUrl(undefined)).toBe("/");
    expect(safeCallbackUrl("")).toBe("/");
    expect(safeCallbackUrl("   ")).toBe("/");
  });

  it("absolute URL → fallback (open redirect engellendi)", () => {
    expect(safeCallbackUrl("https://evil.com")).toBe("/");
    expect(safeCallbackUrl("http://evil.com")).toBe("/");
    expect(safeCallbackUrl("ftp://evil.com")).toBe("/");
  });

  it("protocol-relative URL → fallback", () => {
    expect(safeCallbackUrl("//evil.com")).toBe("/");
    expect(safeCallbackUrl("//evil.com/phishing")).toBe("/");
  });

  it("backslash bypass → fallback", () => {
    expect(safeCallbackUrl("/\\evil.com")).toBe("/");
  });

  it("javascript: bypass → fallback (her iki form)", () => {
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/");
    // /[a-z]+: pattern'i: bazı tarayıcılarda protocol gibi yorumlanma riskine
    // karşı /javascript:... formu da bloklanır.
    expect(safeCallbackUrl("/javascript:alert(1)")).toBe("/");
  });

  it("data: scheme → fallback (no leading slash)", () => {
    expect(safeCallbackUrl("data:text/html,...")).toBe("/");
  });

  it("custom fallback", () => {
    expect(safeCallbackUrl("https://evil.com", "/admin")).toBe("/admin");
    expect(safeCallbackUrl(null, "/login")).toBe("/login");
  });

  it("path + protocol kombinasyonu /a:b → fallback", () => {
    expect(safeCallbackUrl("/javascript:alert")).not.toBe(
      "/javascript:alert"
    );
    // /[a-z]+: path başlangıçtan sonra protocol benzeri pattern → reddet
  });

  it("unicode/special karakterler — relative ise kabul", () => {
    expect(safeCallbackUrl("/ürünler/öğretmen")).toBe("/ürünler/öğretmen");
  });
});
