import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Forward the current pathname as a header so server components (layouts)
 * can reason about which route is rendering.
 *
 * Next 16 renamed `middleware.ts` → `proxy.ts`; export name is `proxy`.
 */
export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Skip static assets + Next internals.
    "/((?!_next|images|uploads|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
