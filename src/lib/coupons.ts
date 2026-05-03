import type { Coupon } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CouponEvalInput = {
  subtotalAfterProductDiscounts: number;
  shippingCost: number;
};

export type CouponEvalOk = {
  ok: true;
  coupon: Coupon;
  discount: number;
  shippingDiscount: number;
};

export type CouponEvalError = {
  ok: false;
  reason:
    | "NOT_FOUND"
    | "INACTIVE"
    | "EXPIRED"
    | "NOT_YET_VALID"
    | "USAGE_LIMIT"
    | "MIN_SUBTOTAL";
  message: string;
};

export type CouponEvalResult = CouponEvalOk | CouponEvalError;

export async function evaluateCoupon(
  code: string,
  input: CouponEvalInput
): Promise<CouponEvalResult> {
  // Türk lokali ile uppercase (i → İ, ı → I) — kullanıcının "ÜRÜN10" yazması
  // ile admin'in "ürün10" girmesi aynı kupona düşer.
  const normalized = code.trim().toLocaleUpperCase("tr-TR");
  if (!normalized) return fail("NOT_FOUND", "Kupon kodu gerekli.");

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalized },
  });
  if (!coupon) return fail("NOT_FOUND", "Kupon bulunamadi.");
  if (!coupon.isActive) return fail("INACTIVE", "Bu kupon aktif degil.");

  const now = new Date();
  if (coupon.validFrom && coupon.validFrom > now) {
    return fail("NOT_YET_VALID", "Kupon henuz gecerli degil.");
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return fail("EXPIRED", "Kuponun gecerlilik suresi dolmus.");
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return fail("USAGE_LIMIT", "Kupon kullanim limiti dolmus.");
  }
  const minSubtotal = Number(coupon.minSubtotal);
  if (input.subtotalAfterProductDiscounts < minSubtotal) {
    return fail(
      "MIN_SUBTOTAL",
      `Bu kupon icin minimum ${minSubtotal.toFixed(2)} TL sepet tutari gerekli.`
    );
  }

  const value = Number(coupon.value);
  let discount = 0;
  let shippingDiscount = 0;
  if (coupon.kind === "PERCENT") {
    discount = Math.round(
      input.subtotalAfterProductDiscounts * (value / 100) * 100
    ) / 100;
  } else if (coupon.kind === "FIXED") {
    discount = Math.min(value, input.subtotalAfterProductDiscounts);
    discount = Math.round(discount * 100) / 100;
  } else if (coupon.kind === "FREE_SHIPPING") {
    shippingDiscount = input.shippingCost;
  }

  return { ok: true, coupon, discount, shippingDiscount };
}

function fail(
  reason: CouponEvalError["reason"],
  message: string
): CouponEvalError {
  return { ok: false, reason, message };
}
