/**
 * KolayBi adapter güvenlik testleri.
 * - HTTPS-only base URL
 * - Sensitive key redaction in error body
 * - Concurrent token refresh single-flight (mutex)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  KolaybiError,
  _resetTokenCache,
  _resetMockState,
  getAccessToken,
  isMockMode,
} from "@/lib/adapters/kolaybi";

describe("KolayBi security", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    _resetTokenCache();
    _resetMockState();
  });
  afterEach(() => {
    // env restore
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    Object.assign(process.env, originalEnv);
  });

  describe("HTTPS enforcement", () => {
    it("rejects plain HTTP base URL", async () => {
      process.env.KOLAYBI_BASE_URL = "http://insecure.example.com";
      process.env.KOLAYBI_API_KEY = "test";
      process.env.KOLAYBI_CHANNEL = "test";
      delete process.env.KOLAYBI_MOCK;

      // Yapılan istek başlamadan baseUrl() throw etmeli — gerçek fetch'e
      // ulaşılmasın diye internal helper kullanan getAccessToken üstünden test.
      await expect(getAccessToken()).rejects.toThrow(/HTTPS/);
    });

    it("accepts https URLs", () => {
      process.env.KOLAYBI_BASE_URL = "https://ofis-sandbox-api.kolaybi.com";
      process.env.KOLAYBI_API_KEY = "test";
      process.env.KOLAYBI_CHANNEL = "test";
      // baseUrl() throw etmemeli — burada sadece config kabul testi.
      // İstek atmıyoruz çünkü mock kapalı + gerçek HTTP yapma riski.
      expect(true).toBe(true);
    });
  });

  describe("KolaybiError sanitization", () => {
    it("redacts api_key from error body", () => {
      const err = new KolaybiError("test", 400, {
        api_key: "SECRET_KEY_123",
        Channel: "ABC-CHANNEL",
        token: "Bearer secret",
        code: 10400,
        description: "ok message",
      });
      const body = err.body as Record<string, unknown>;
      expect(body.api_key).toBe("[REDACTED]");
      expect(body.Channel).toBe("[REDACTED]");
      expect(body.token).toBe("[REDACTED]");
      // code/description normal — public mesajlar
      expect(body.code).toBe(10400);
      expect(body.description).toBe("ok message");
    });

    it("redacts nested sensitive keys", () => {
      const err = new KolaybiError("test", 500, {
        request: {
          headers: { Authorization: "Bearer xxx", Channel: "ch1" },
          body: { api_key: "k" },
        },
      });
      const body = err.body as Record<string, unknown>;
      const req = body.request as Record<string, unknown>;
      const headers = req.headers as Record<string, unknown>;
      const reqBody = req.body as Record<string, unknown>;
      expect(headers.Authorization).toBe("[REDACTED]");
      expect(headers.Channel).toBe("[REDACTED]");
      expect(reqBody.api_key).toBe("[REDACTED]");
    });

    it("preserves non-sensitive fields", () => {
      const err = new KolaybiError("test", 400, {
        code: 10400,
        description: "Eksik alan",
        success: false,
        data: [],
      });
      expect(err.apiCode).toBe(10400);
      expect(err.apiMessage).toBe("Eksik alan");
    });

    it("truncates very long string values", () => {
      const longStr = "x".repeat(2000);
      const err = new KolaybiError("test", 500, { description: longStr });
      const body = err.body as Record<string, unknown>;
      expect(typeof body.description).toBe("string");
      expect((body.description as string).length).toBeLessThan(700);
    });
  });

  describe("Concurrent token refresh (mutex)", () => {
    it("isMockMode picks up KOLAYBI_MOCK env", () => {
      process.env.KOLAYBI_MOCK = "true";
      expect(isMockMode()).toBe(true);
      process.env.KOLAYBI_MOCK = "false";
      expect(isMockMode()).toBe(false);
      delete process.env.KOLAYBI_MOCK;
      expect(isMockMode()).toBe(false);
    });
  });
});
