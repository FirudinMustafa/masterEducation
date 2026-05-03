import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as kolaybi from "@/lib/adapters/kolaybi";

const ORIG = {
  KOLAYBI_API_KEY: process.env.KOLAYBI_API_KEY,
  KOLAYBI_CHANNEL: process.env.KOLAYBI_CHANNEL,
  KOLAYBI_BASE_URL: process.env.KOLAYBI_BASE_URL,
};

describe("KolayBi adapter", () => {
  beforeEach(() => {
    delete process.env.KOLAYBI_API_KEY;
    delete process.env.KOLAYBI_CHANNEL;
    process.env.KOLAYBI_BASE_URL = "https://ofis-sandbox-api.kolaybi.com";
    kolaybi._resetTokenCache();
  });

  afterEach(() => {
    if (ORIG.KOLAYBI_API_KEY) process.env.KOLAYBI_API_KEY = ORIG.KOLAYBI_API_KEY;
    if (ORIG.KOLAYBI_CHANNEL) process.env.KOLAYBI_CHANNEL = ORIG.KOLAYBI_CHANNEL;
    if (ORIG.KOLAYBI_BASE_URL) process.env.KOLAYBI_BASE_URL = ORIG.KOLAYBI_BASE_URL;
    kolaybi._resetTokenCache();
    vi.restoreAllMocks();
  });

  it("isConfigured() = false when env vars missing", () => {
    expect(kolaybi.isConfigured()).toBe(false);
  });

  it("isConfigured() = true when both API_KEY and CHANNEL set", () => {
    process.env.KOLAYBI_API_KEY = "key";
    process.env.KOLAYBI_CHANNEL = "channel";
    expect(kolaybi.isConfigured()).toBe(true);
  });

  it("authedFetch throws KolaybiError in DRYRUN mode", async () => {
    await expect(kolaybi.authedFetch("/test")).rejects.toThrow(/DRYRUN/);
  });

  it("getAccessToken success — token caches", async () => {
    process.env.KOLAYBI_API_KEY = "test-key";
    process.env.KOLAYBI_CHANNEL = "test-channel";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: "fake-jwt-token-eyJabc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as unknown as Response,
    );

    const t1 = await kolaybi.getAccessToken();
    expect(t1).toBe("fake-jwt-token-eyJabc");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call uses cache
    const t2 = await kolaybi.getAccessToken();
    expect(t2).toBe("fake-jwt-token-eyJabc");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still 1
  });

  it("getAccessToken sends correct headers + body", async () => {
    process.env.KOLAYBI_API_KEY = "abc123";
    process.env.KOLAYBI_CHANNEL = "channel-x";

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: "tok" }), { status: 200 }) as unknown as Response,
    );

    await kolaybi.getAccessToken();

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://ofis-sandbox-api.kolaybi.com/kolaybi/v1/access_token");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Channel"]).toBe("channel-x");
    expect(headers["content-type"]).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify({ api_key: "abc123" }));
  });

  it("getAccessToken throws KolaybiError on 401", async () => {
    process.env.KOLAYBI_API_KEY = "bad";
    process.env.KOLAYBI_CHANNEL = "channel";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Invalid API key", { status: 401 }) as unknown as Response,
    );
    await expect(kolaybi.getAccessToken()).rejects.toMatchObject({
      name: "KolaybiError",
      status: 401,
    });
  });

  it("authedFetch retries once on 401 with fresh token", async () => {
    process.env.KOLAYBI_API_KEY = "k";
    process.env.KOLAYBI_CHANNEL = "c";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      // First: token fetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "old-token" }), { status: 200 }) as unknown as Response,
      )
      // Second: actual call → 401
      .mockResolvedValueOnce(
        new Response("expired", { status: 401 }) as unknown as Response,
      )
      // Third: token re-fetch (after cache reset)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "new-token" }), { status: 200 }) as unknown as Response,
      )
      // Fourth: actual call retry → 200
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }) as unknown as Response,
      );

    const result = await kolaybi.authedFetch("/kolaybi/v1/test");
    expect(result).toEqual({ data: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("authedFetch surfaces non-401 errors via KolaybiError", async () => {
    process.env.KOLAYBI_API_KEY = "k";
    process.env.KOLAYBI_CHANNEL = "c";
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: "tok" }), { status: 200 }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "validation failed" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        }) as unknown as Response,
      );
    await expect(kolaybi.authedFetch("/kolaybi/v1/invoices", { body: { x: 1 } })).rejects.toMatchObject({
      name: "KolaybiError",
      status: 422,
    });
  });

  it("KolaybiError parses KolayBi error body (apiCode/apiMessage)", () => {
    const err = new kolaybi.KolaybiError("test", 401, {
      data: [],
      code: 10401,
      message: "Oturum süreniz doldu",
      description: "Oturum süreniz doldu. Lütfen tekrar giriş yapın.",
      success: false,
    });
    expect(err.apiCode).toBe(10401);
    expect(err.apiMessage).toBe("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
    expect(err.isExpiredToken).toBe(true);
    expect(err.isConfigError).toBe(false);
  });

  it("KolaybiError detects channel-not-found (config error)", () => {
    const err = new kolaybi.KolaybiError("test", 404, {
      data: [],
      code: 10404,
      message: "Kanal bulunamadı.",
      description: "Kanal bulunamadı.",
      success: false,
    });
    expect(err.isConfigError).toBe(true);
    expect(err.isExpiredToken).toBe(false);
  });
});
