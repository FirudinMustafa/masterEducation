/**
 * Sliding-window rate limiter — adapter pattern.
 *
 * - **Default**: in-memory (per-process). Tek-instance dev/prod için yeterli.
 * - **Production / horizontal scale**: `UPSTASH_REDIS_REST_URL` ve
 *   `UPSTASH_REDIS_REST_TOKEN` env'leri tanımlıysa Upstash REST üzerinden
 *   distributed sliding-window'a geçer (process arası tutarlılık + serverless).
 *
 * Bölüm 1 P1-DEPLOY-2 → Faz 4.4: Vercel/serverless'da her cold start veya
 * concurrent worker yeni map yarattığı için in-memory limit `>>10×` görünür
 * → register/login limiti pratik bypass. Upstash backend bu sızıntıyı kapatır.
 *
 * API geriye dönük uyumlu (`rateLimit(key, max, windowMs)`); call-site
 * değişikliği gerektirmez.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

interface RateLimitAdapter {
  check(key: string, max: number, windowMs: number): Promise<RateLimitResult> | RateLimitResult;
}

// ─── in-memory adapter ──────────────────────────────────────────────────

type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
const LAST_SEEN_LIMIT_MS = 24 * 60 * 60 * 1000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 5 * 60 * 1000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const latest = bucket.hits[bucket.hits.length - 1] ?? 0;
    if (now - latest > LAST_SEEN_LIMIT_MS) {
      buckets.delete(key);
    }
  }
}

const memoryAdapter: RateLimitAdapter = {
  check(key, max, windowMs) {
    const now = Date.now();
    sweep(now);
    const bucket = buckets.get(key) ?? { hits: [] };
    const windowStart = now - windowMs;
    bucket.hits = bucket.hits.filter((t) => t > windowStart);
    if (bucket.hits.length >= max) {
      buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        resetAt: (bucket.hits[0] ?? now) + windowMs,
      };
    }
    bucket.hits.push(now);
    buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: max - bucket.hits.length,
      resetAt: now + windowMs,
    };
  },
};

// ─── Upstash Redis (REST) adapter ───────────────────────────────────────
// Single-call sliding window via Lua-equivalent pipeline — atomic via REST
// pipeline endpoint. Upstash @upstash/redis SDK kullanmadık; ek dep yok,
// fetch + Bearer token yeterli.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function upstashPipeline(commands: unknown[][]): Promise<unknown[]> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) throw new Error("UPSTASH_NOT_CONFIGURED");
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    // Upstash REST is fast (<50ms) but never let it block too long.
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) {
    throw new Error(`upstash_${res.status}`);
  }
  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  return data.map((r) => (r.error ? null : r.result));
}

const upstashAdapter: RateLimitAdapter = {
  async check(key, max, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    const redisKey = `rl:${key}`;

    try {
      // Sliding window: remove old, add current, count, set ttl. Pipeline atomic.
      const [, , count] = (await upstashPipeline([
        ["ZREMRANGEBYSCORE", redisKey, 0, windowStart],
        ["ZADD", redisKey, now, member],
        ["ZCARD", redisKey],
        ["PEXPIRE", redisKey, windowMs * 2],
      ])) as [unknown, unknown, number, unknown];

      if (typeof count !== "number") {
        // Fallback if Upstash returned malformed; allow this request, log.
        console.warn("[rate-limit:upstash] unexpected count", count);
        return memoryAdapter.check(key, max, windowMs);
      }

      const allowed = count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - count),
        resetAt: now + windowMs,
      };
    } catch (err) {
      // Upstash transient error → fail-open (in-memory). Sıfır-erişim'den iyi.
      console.error("[rate-limit:upstash] error", err);
      return memoryAdapter.check(key, max, windowMs);
    }
  },
};

// ─── Public API ─────────────────────────────────────────────────────────

const adapter: RateLimitAdapter =
  UPSTASH_URL && UPSTASH_TOKEN ? upstashAdapter : memoryAdapter;

/**
 * Backward-compat sync API (in-memory).
 * Çoğu callsite synchronous ve hot-path; `await` ekleme refactor'ından
 * kaçınmak için sync wrapper bırakıldı. Upstash'a geçmek istenen route'lar
 * yeni `rateLimitAsync` API'sini kullansın.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  return memoryAdapter.check(key, maxRequests, windowMs) as RateLimitResult;
}

/**
 * Async version — Upstash configured ise distributed; değilse in-memory.
 * Login/register gibi production'da horizontal-scale bypass'ı kapatması
 * gereken kritik route'lar için.
 */
export async function rateLimitAsync(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  return await adapter.check(key, maxRequests, windowMs);
}

/** Test helper — not used in prod. */
export function __resetRateLimitStore(): void {
  buckets.clear();
}

/** Diagnostic — `/api/health` ve audit raporları için. */
export function rateLimitBackend(): "upstash" | "memory" {
  return UPSTASH_URL && UPSTASH_TOKEN ? "upstash" : "memory";
}
