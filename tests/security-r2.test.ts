import { describe, it, expect } from "vitest";
import { hashToken } from "@/lib/token-hash";
import { sanitizeAuditMetadata } from "@/lib/audit";
import { escapeHtml } from "@/lib/email";

describe("hashToken (P0 — DB breach koruması)", () => {
  it("token → SHA-256 hex (64 char)", () => {
    const h = hashToken("abc123");
    expect(h).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(h)).toBe(true);
  });

  it("aynı token aynı hash (deterministic)", () => {
    expect(hashToken("foo")).toBe(hashToken("foo"));
  });

  it("farklı token farklı hash", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("hash → token tersi yok (one-way)", () => {
    // SHA-256 hash'inde plain token görünmemeli
    const t = "secret-reset-token-12345";
    const h = hashToken(t);
    expect(h).not.toContain(t);
    expect(h).not.toContain("secret");
  });
});

describe("sanitizeAuditMetadata (P1 — log leakage koruması)", () => {
  it("password key → REDACTED", () => {
    const r = sanitizeAuditMetadata({ password: "p@ss123", email: "x@y.com" });
    expect(r).toEqual({ password: "[REDACTED]", email: "x@y.com" });
  });

  it("token / resetToken / accessToken → REDACTED", () => {
    const r = sanitizeAuditMetadata({
      token: "raw",
      resetToken: "raw",
      accessToken: "raw",
      apiKey: "raw",
    });
    expect(r).toEqual({
      token: "[REDACTED]",
      resetToken: "[REDACTED]",
      accessToken: "[REDACTED]",
      apiKey: "[REDACTED]",
    });
  });

  it("nested object'lerde de redact", () => {
    const r = sanitizeAuditMetadata({
      user: { id: "u1", password: "secret" },
      action: "login",
    });
    expect(r).toEqual({
      user: { id: "u1", password: "[REDACTED]" },
      action: "login",
    });
  });

  it("array içinde redact", () => {
    const r = sanitizeAuditMetadata([{ pwd: "x" }, { name: "ali" }]);
    expect(r).toEqual([{ pwd: "[REDACTED]" }, { name: "ali" }]);
  });

  it("kart bilgisi", () => {
    const r = sanitizeAuditMetadata({ cardNumber: "4111...", cvv: "123" });
    expect(r).toEqual({ cardNumber: "[REDACTED]", cvv: "[REDACTED]" });
  });

  it("güvenli alanlar dokunulmaz", () => {
    const r = sanitizeAuditMetadata({
      orderNumber: "ORD-123",
      total: 100,
      items: [{ sku: "X", qty: 1 }],
    });
    expect(r).toEqual({
      orderNumber: "ORD-123",
      total: 100,
      items: [{ sku: "X", qty: 1 }],
    });
  });

  it("null/undefined/primitive değerler", () => {
    expect(sanitizeAuditMetadata(null)).toBe(null);
    expect(sanitizeAuditMetadata(undefined)).toBe(undefined);
    expect(sanitizeAuditMetadata("text")).toBe("text");
    expect(sanitizeAuditMetadata(42)).toBe(42);
  });

  it("case-insensitive (Password, PWD, TOKEN)", () => {
    const r = sanitizeAuditMetadata({
      Password: "x",
      PWD: "x",
      TOKEN: "x",
    });
    expect(r).toEqual({
      Password: "[REDACTED]",
      PWD: "[REDACTED]",
      TOKEN: "[REDACTED]",
    });
  });
});

describe("escapeHtml (P2 — email template XSS)", () => {
  it("standart HTML karakterler escape", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("img onerror payload", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it("ampersand önce", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
    // & önce escape edilirse double-encoding olmaz: helper'da & ilk replace
  });

  it("normal metin değişmez", () => {
    expect(escapeHtml("Ali Veli — Test")).toBe("Ali Veli — Test");
  });

  it("Türkçe karakterler korunur", () => {
    expect(escapeHtml("İŞÇĞÜÖ ışçğüö")).toBe("İŞÇĞÜÖ ışçğüö");
  });

  it("apostrof + tırnak", () => {
    expect(escapeHtml(`O'Brien "test"`)).toBe(
      "O&#39;Brien &quot;test&quot;"
    );
  });
});
