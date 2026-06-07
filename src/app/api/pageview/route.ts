import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const schema = z.object({
  path: z.string().min(1).max(500),
  referer: z.string().max(500).optional().nullable(),
  sessionId: z.string().max(64).optional().nullable(),
});

const IGNORE_PREFIXES = [
  "/api/",
  "/admin/",
  "/bayi/",
  "/_next",
  "/uploads/",
  "/images/",
];

export async function POST(req: NextRequest) {
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali).
  const ip = getClientIp(req.headers);
  // Cheap protection against tracking spam. Real systems use a proper
  // analytics sink with sampling.
  const rl = rateLimit(`pageview:${ip}`, 240, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  // Skip admin/dealer/api paths — we don't want to spy on operations.
  if (IGNORE_PREFIXES.some((p) => parsed.data.path.startsWith(p))) {
    return NextResponse.json({ ok: true });
  }

  const session = await auth();

  prisma.pageView
    .create({
      data: {
        path: parsed.data.path,
        referer: parsed.data.referer ?? null,
        sessionId: parsed.data.sessionId ?? null,
        userId: session?.user?.id ?? null,
        userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    })
    .catch((err) => {
      console.error("[pageview] write failed", err);
    });

  return NextResponse.json({ ok: true });
}
