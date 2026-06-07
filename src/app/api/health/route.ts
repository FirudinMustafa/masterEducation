import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitBackend } from "@/lib/rate-limit";

/**
 * /api/health — uptime monitor & deploy smoke probe.
 *
 * - DB ping (`SELECT 1`)
 * - Email transport configured? (env var presence — gerçek bağlantı atılmaz,
 *   ücretsiz Resend hesaplarını boş yere yormamak için)
 * - Payment gateway configured? (env var presence)
 * - Rate-limit backend (memory / upstash)
 *
 * **Response codes:**
 *   - 200: tüm kritik bileşenler ok
 *   - 503: DB unreachable (uptime monitor → P0 alert)
 *
 * **Public:** kimlik doğrulama yok — uptime monitor'ün çağırabilmesi için.
 * Bilgi sızıntısı (env detayları) yok; sadece "ok / not_ok" durumları.
 */

type ComponentStatus = "ok" | "not_configured" | "error";

interface HealthBody {
  status: "ok" | "degraded";
  ts: string;
  components: {
    db: ComponentStatus;
    email: ComponentStatus;
    payment: ComponentStatus;
    shipping: ComponentStatus;
    sentry: ComponentStatus;
    rateLimitBackend: "upstash" | "memory";
  };
}

export async function GET() {
  const components: HealthBody["components"] = {
    db: "error",
    email: "not_configured",
    payment: "not_configured",
    shipping: "not_configured",
    sentry: "not_configured",
    rateLimitBackend: rateLimitBackend(),
  };

  // DB ping — kritik. Diğerlerinden bağımsız çağırıp timeout kontrolü.
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DB_TIMEOUT")), 2000)
      ),
    ]);
    components.db = "ok";
  } catch {
    components.db = "error";
  }

  // Email — Resend HTTP API (öncelikli) veya SMTP env var presence
  if (
    process.env.RESEND_API_KEY ||
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  ) {
    components.email = "ok";
  }

  // Payment — Iyzico env var presence (sandbox veya prod)
  if (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY) {
    components.payment = "ok";
  } else if (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_MOCK_PAYMENTS === "true"
  ) {
    components.payment = "ok"; // mock OK in dev/staging
  }

  // Shipping — Shipentegra env var presence
  if (process.env.SHIPENTEGRA_API_KEY) {
    components.shipping = "ok";
  } else if (process.env.NODE_ENV !== "production") {
    components.shipping = "ok"; // mock OK in dev
  }

  // Sentry / observability
  if (process.env.SENTRY_DSN) {
    components.sentry = "ok";
  }

  const isHealthy = components.db === "ok";
  const body: HealthBody = {
    status: isHealthy ? "ok" : "degraded",
    ts: new Date().toISOString(),
    components,
  };

  return NextResponse.json(body, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
