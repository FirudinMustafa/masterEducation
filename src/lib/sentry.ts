/**
 * Sentry adapter — Faz 4.6.
 *
 * Dependency-free wrapper. Production'da `SENTRY_DSN` set'se Sentry
 * Envelope API'sine direkt POST atar; PII scrubber on (email/auth header
 * gibi alanları redact eder).
 *
 * `@sentry/nextjs` paketini ekleyince bu modülü onun `Sentry.captureException`
 * + `Sentry.addBreadcrumb` çağrılarına swap edebilirsin (interface aynı kalır).
 *
 * Önemli: bu modül asla throw atmaz; logging zincirinin sonuncusudur.
 */

const DSN = process.env.SENTRY_DSN;
const RELEASE = process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA;
const ENVIRONMENT =
  process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";

// PII scrubber — gözle görünür sızıntıları redact et.
const PII_KEYS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /^email$/i,
  /\bphone\b/i,
];

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TOO_DEEP]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEYS.some((re) => re.test(k))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = scrub(v, depth + 1);
    }
  }
  return out;
}

export type SentryEvent = {
  source: "server" | "client" | "api";
  message: string;
  stack: string | null;
  url: string | null;
  userId: string | null;
  userAgent: string | null;
};

function parseDsn(dsn: string): {
  envelopeUrl: string;
  publicKey: string;
} | null {
  // Format: https://<key>@<host>/<project_id>
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn);
  if (!m) return null;
  const [, publicKey, host, projectId] = m;
  return {
    envelopeUrl: `https://${host}/api/${projectId}/envelope/`,
    publicKey,
  };
}

const parsed = DSN ? parseDsn(DSN) : null;

export function reportToSentry(input: SentryEvent): void {
  if (!parsed) return; // DSN yok → no-op

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: ENVIRONMENT,
    release: RELEASE,
    logger: input.source,
    message: { formatted: input.message.slice(0, 4000) },
    tags: { source: input.source },
    user: input.userId ? { id: input.userId } : undefined,
    extra: scrub({
      url: input.url,
      userAgent: input.userAgent,
    }),
    exception: input.stack
      ? {
          values: [
            {
              type: "Error",
              value: input.message.slice(0, 1000),
              stacktrace: { frames: parseStack(input.stack) },
            },
          ],
        }
      : undefined,
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  // Fire-and-forget. Asla throw atma, asla await etme — caller'i bloklama.
  fetch(parsed.envelopeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": [
        "Sentry sentry_version=7",
        `sentry_key=${parsed.publicKey}`,
        "sentry_client=master-education/1.0",
      ].join(", "),
    },
    body: envelope,
    signal: AbortSignal.timeout(3000),
  }).catch((err) => {
    console.error("[sentry] envelope post failed", err);
  });
}

function parseStack(stack: string): Array<{
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
}> {
  return stack
    .split("\n")
    .slice(0, 30)
    .map((line) => {
      const m = /at\s+(\S+)\s+\(([^)]+):(\d+):(\d+)\)/.exec(line);
      if (m) {
        return {
          function: m[1],
          filename: m[2],
          lineno: Number(m[3]),
          colno: Number(m[4]),
        };
      }
      return { function: line.trim() };
    });
}

export function sentryConfigured(): boolean {
  return !!parsed;
}
