import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Vercel Cron, tetikledigi istegi `Authorization: Bearer ${CRON_SECRET}`
 * header'i ile imzalar. CRON_SECRET tanimli degilse endpoint kapalidir
 * (503) — yanlislikla public erisim olmaz.
 */
export function authorizeCronRequest(req: NextRequest):
  | { ok: true }
  | { ok: false; status: number; reason: string } {
  if (!env.CRON_SECRET) {
    return { ok: false, status: 503, reason: "CRON_NOT_CONFIGURED" };
  }
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, reason: "MISSING_BEARER" };
  }
  const token = auth.slice("Bearer ".length).trim();
  // Sabit-zamanli karsilastirma
  if (
    token.length !== env.CRON_SECRET.length ||
    !timingSafeEq(token, env.CRON_SECRET)
  ) {
    return { ok: false, status: 401, reason: "INVALID_TOKEN" };
  }
  return { ok: true };
}

function timingSafeEq(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
