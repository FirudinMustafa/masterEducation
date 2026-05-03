/**
 * In-memory sliding window rate limiter.
 *
 * For single-instance dev / small prod deployments. Switch to a Redis/Upstash
 * backed limiter before scaling horizontally — in-memory state is per-process
 * and will let requests through if multiple servers share traffic.
 */

type Bucket = {
  hits: number[];
};

const buckets = new Map<string, Bucket>();

// Periodically trim cold keys to avoid unbounded growth.
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

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [] };
  const windowStart = now - windowMs;

  bucket.hits = bucket.hits.filter((t) => t > windowStart);

  if (bucket.hits.length >= maxRequests) {
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
    remaining: maxRequests - bucket.hits.length,
    resetAt: now + windowMs,
  };
}

/** Test helper — not used in prod. */
export function __resetRateLimitStore(): void {
  buckets.clear();
}
