import { NextResponse } from "next/server";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { env } from "@/lib/env";

/**
 * Dev-only helper for the E2E scenario runner. Disabled in production.
 */
export async function POST() {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  __resetRateLimitStore();
  return NextResponse.json({ ok: true });
}
