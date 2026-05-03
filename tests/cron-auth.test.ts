import { describe, it, expect } from "vitest";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { NextRequest } from "next/server";

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("http://localhost/api/cron/test", { headers });
}

describe("authorizeCronRequest", () => {
  const SECRET = "test-cron-secret-sixteen-chars-min";

  it("rejects missing Authorization header", () => {
    const r = authorizeCronRequest(makeReq());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.reason).toBe("MISSING_BEARER");
    }
  });

  it("rejects non-Bearer scheme", () => {
    const r = authorizeCronRequest(makeReq(`Basic ${SECRET}`));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_BEARER");
  });

  it("rejects wrong token", () => {
    const r = authorizeCronRequest(makeReq("Bearer wrong-token-of-same-len-here"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.reason).toBe("INVALID_TOKEN");
    }
  });

  it("rejects token of different length", () => {
    const r = authorizeCronRequest(makeReq("Bearer short"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("INVALID_TOKEN");
  });

  it("accepts the right token", () => {
    const r = authorizeCronRequest(makeReq(`Bearer ${SECRET}`));
    expect(r.ok).toBe(true);
  });
});
