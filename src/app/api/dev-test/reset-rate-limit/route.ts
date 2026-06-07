import { NextResponse } from "next/server";
import { __resetRateLimitStore } from "@/lib/rate-limit";
import { env } from "@/lib/env";

/**
 * Dev-only helper for the E2E scenario runner. Disabled in production.
 */
export async function POST() {
  // F-0009: yalnizca test ortamlarinda calismali. NEXT_PUBLIC_E2E *public* bir
  // bayrak oldugu icin production'da ASLA aciga cikmamali — aksi halde saldirgan
  // tum IP rate-limit'lerini sifirlayip credential-stuffing yapabilir. Bu yuzden
  // production'da E2E bayragi olsa bile 404; yalnizca non-prod + E2E acik veya
  // NODE_ENV=test gecerli.
  const isTest = env.NODE_ENV === "test";
  const isE2E = process.env.NEXT_PUBLIC_E2E === "1" && env.NODE_ENV !== "production";
  if (!isTest && !isE2E) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  __resetRateLimitStore();
  return NextResponse.json({ ok: true });
}
