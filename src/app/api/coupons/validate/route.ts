import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { evaluateCoupon } from "@/lib/coupons";
import { flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/get-client-ip";

const schema = z.object({
  code: z.string().min(1).max(40),
  subtotal: z.number().min(0),
  shippingCost: z.number().min(0).default(0),
});

export async function POST(req: NextRequest) {
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali).
  const ip = getClientIp(req.headers);
  // Brute-force kupon kodu denemeye karsi: saatte 20 dogrulama / IP.
  const rl = rateLimit(`coupon-validate:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla kupon denemesi. Bir sure sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const result = await evaluateCoupon(parsed.data.code, {
    subtotalAfterProductDiscounts: parsed.data.subtotal,
    shippingCost: parsed.data.shippingCost,
  });

  // Başarısız denemeleri audit et — KVKK uyumlu sekilde sadece kod + IP.
  if (!result.ok) {
    logAudit({
      actorId: null,
      action: "COUPON_VALIDATE",
      entityType: "system",
      entityId: "coupon",
      metadata: {
        code: parsed.data.code.slice(0, 40),
        result: "invalid",
        reason: result.message,
        ip: ip.slice(0, 64),
      },
    });
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({
    code: result.coupon.code,
    kind: result.coupon.kind,
    discount: result.discount,
    shippingDiscount: result.shippingDiscount,
  });
}
