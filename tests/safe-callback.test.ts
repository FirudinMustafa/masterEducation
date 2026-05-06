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

  // P2-LIB-1 (Bölüm 1): decode-once + control-char reddi
  it("encoded protocol-relative bypass → fallback", () => {
    // %2f = "/" → decoded "//evil.com" olur
    expect(safeCallbackUrl("/%2fevil.com")).toBe("/");
    expect(safeCallbackUrl("%2f%2fevil.com")).toBe("/");
    expect(safeCallbackUrl("%2F%2Fevil.com")).toBe("/");
  });

  it("control-character prefix bypass (TAB/LF/CR) → fallback", () => {
    // %09 = TAB, %0a = LF, %0d = CR
    expect(safeCallbackUrl("/\t//evil.com")).toBe("/");
    expect(safeCallbackUrl("%09//evil.com")).toBe("/");
    expect(safeCallbackUrl("%0a//evil.com")).toBe("/");
    expect(safeCallbackUrl("%0d//evil.com")).toBe("/");
  });

  it("backslash anywhere → fallback (Windows path normalize)", () => {
    expect(safeCallbackUrl("/path\\evil")).toBe("/");
    expect(safeCallbackUrl("/path%5cevil")).toBe("/");
  });

  it("invalid percent-encoding → fallback", () => {
    // decodeURIComponent("/%E0%A4") atar → fallback
    expect(safeCallbackUrl("/%E0%A4")).toBe("/");
  });

  it("decoded form javascript: → fallback", () => {
    // decode "/javascript:alert" — /[a-z]+: pattern'i decoded'da da çalışır
    expect(safeCallbackUrl("/%6aavascript:alert")).toBe("/");
  });
});
