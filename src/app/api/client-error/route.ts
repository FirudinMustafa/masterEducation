import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { logError } from "@/lib/error-log";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  message: z.string().min(1).max(4000),
  stack: z.string().max(8000).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  source: z.enum(["client"]).default("client"),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // Protect the endpoint from abuse — we do not want a buggy client to
  // flood our DB.
  const rl = rateLimit(`client-error:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: true });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const session = await auth();
  logError({
    source: "client",
    message: parsed.data.message,
    stack: parsed.data.stack ?? null,
    url: parsed.data.url ?? null,
    userId: session?.user?.id ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });
  return NextResponse.json({ ok: true });
}
