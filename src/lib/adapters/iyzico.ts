/**
 * Iyzico ödeme gateway adapter — Faz 4.2.
 *
 * Sandbox ve prod için aynı arayüz. Env var'ları:
 *   IYZICO_API_KEY        — sandbox/prod API key
 *   IYZICO_SECRET_KEY     — HMAC signature secret (callback/webhook verify)
 *   IYZICO_BASE_URL       — default `https://sandbox-api.iyzipay.com`
 *                           prod: `https://api.iyzipay.com`
 *   IYZICO_CALLBACK_URL   — 3DS sonrası bizim callback path'imiz
 *
 * Adapter mock fallback (env yoksa) `MAGIC_OTP=123456` mock'u TAKLİT EDER —
 * mevcut `/api/payments/mock` UI'sini bozmadan 3DS akışı kod-hazır kalır.
 *
 * Gerçek Iyzico SDK paket boyutu büyük olduğu için raw fetch + HMAC SHA1
 * (PKI v1) ile entegre. Iyzico v2 (HMAC SHA256) GA olunca güncellenir.
 */

import crypto from "crypto";

export type IyzicoInitInput = {
  paymentId: string;
  total: number;
  currency: "TRY";
  customer: {
    id: string;
    name: string;
    surname: string;
    email: string;
    phone: string;
    ip: string;
  };
  billing: {
    address: string;
    city: string;
    country?: string;
  };
  items: Array<{
    id: string;
    name: string;
    category: string;
    price: number;
  }>;
  callbackUrl: string;
};

export type IyzicoInitResult =
  | {
      ok: true;
      conversationId: string;
      paymentPageUrl: string; // 3DS popup/redirect URL
      providerToken: string; // Iyzico'nun bizim için tuttuğu token
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
    };

export type IyzicoCallbackPayload = {
  conversationId: string;
  paymentId: string;
  status: "success" | "failure" | "callback_thr"; // 3DS auth result
  signature: string;
};

export type IyzicoWebhookPayload = {
  iyziEventType: "PAYMENT" | "REFUND" | "CHARGEBACK";
  iyziReferenceCode: string; // bizim paymentId
  paymentId: string;
  paymentStatus: "SUCCESS" | "FAILURE" | "REFUNDED" | "CANCELLED";
  signature: string; // HMAC of body
};

export interface IyzicoAdapter {
  init(input: IyzicoInitInput): Promise<IyzicoInitResult>;
  verifyCallback(payload: IyzicoCallbackPayload): boolean;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(input: { paymentId: string; amount: number }): Promise<
    | { ok: true; refundId: string }
    | { ok: false; errorCode: string; errorMessage: string }
  >;
}

// ─── Real adapter ────────────────────────────────────────────────────

class RealIyzicoAdapter implements IyzicoAdapter {
  constructor(
    private apiKey: string,
    private secretKey: string,
    private baseUrl: string
  ) {}

  // PKI authorization signature (HMAC-SHA1 of randomString + body, base64).
  private authHeader(randomString: string, requestBody: string): string {
    const data = this.apiKey + randomString + this.secretKey + requestBody;
    const hashed = crypto.createHash("sha1").update(data).digest("base64");
    return `IYZWS ${this.apiKey}:${hashed}`;
  }

  async init(input: IyzicoInitInput): Promise<IyzicoInitResult> {
    const body = {
      locale: "tr",
      conversationId: input.paymentId,
      price: input.total.toFixed(2),
      paidPrice: input.total.toFixed(2),
      currency: input.currency,
      basketId: input.paymentId,
      paymentGroup: "PRODUCT",
      callbackUrl: input.callbackUrl,
      buyer: {
        id: input.customer.id,
        name: input.customer.name,
        surname: input.customer.surname,
        gsmNumber: input.customer.phone,
        email: input.customer.email,
        identityNumber: "11111111111", // TC required by Iyzico; bağ yapılmadığı için sentinel
        registrationAddress: input.billing.address,
        ip: input.customer.ip,
        city: input.billing.city,
        country: input.billing.country ?? "Turkey",
      },
      shippingAddress: {
        contactName: `${input.customer.name} ${input.customer.surname}`,
        city: input.billing.city,
        country: input.billing.country ?? "Turkey",
        address: input.billing.address,
      },
      billingAddress: {
        contactName: `${input.customer.name} ${input.customer.surname}`,
        city: input.billing.city,
        country: input.billing.country ?? "Turkey",
        address: input.billing.address,
      },
      basketItems: input.items.map((it) => ({
        id: it.id,
        name: it.name,
        category1: it.category,
        itemType: "PHYSICAL",
        price: it.price.toFixed(2),
      })),
    };

    const requestBody = JSON.stringify(body);
    const randomString = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const auth = this.authHeader(randomString, requestBody);

    try {
      const res = await fetch(`${this.baseUrl}/payment/iyzipos/checkoutform/initialize/auth/ecom`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "x-iyzi-rnd": randomString,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (data.status !== "success") {
        return {
          ok: false,
          errorCode: String(data.errorCode ?? "UNKNOWN"),
          errorMessage: String(data.errorMessage ?? "Iyzico init failed"),
        };
      }
      return {
        ok: true,
        conversationId: input.paymentId,
        paymentPageUrl: String(data.paymentPageUrl ?? ""),
        providerToken: String(data.token ?? ""),
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "fetch failed",
      };
    }
  }

  verifyCallback(payload: IyzicoCallbackPayload): boolean {
    // Iyzico 3DS callback'inde signature parametresi gelir; HMAC-SHA1 of
    // (paymentId + conversationId + secret).
    const expected = crypto
      .createHmac("sha1", this.secretKey)
      .update(`${payload.paymentId}${payload.conversationId}`)
      .digest("base64");
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(payload.signature || "")
    );
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = crypto
      .createHmac("sha256", this.secretKey)
      .update(rawBody)
      .digest("hex");
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  }

  async refund(input: { paymentId: string; amount: number }): Promise<
    | { ok: true; refundId: string }
    | { ok: false; errorCode: string; errorMessage: string }
  > {
    const body = {
      locale: "tr",
      conversationId: input.paymentId,
      paymentTransactionId: input.paymentId,
      price: input.amount.toFixed(2),
      currency: "TRY",
      ip: "0.0.0.0",
    };
    const requestBody = JSON.stringify(body);
    const randomString = `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const auth = this.authHeader(randomString, requestBody);

    try {
      const res = await fetch(`${this.baseUrl}/payment/refund`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "x-iyzi-rnd": randomString,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (data.status !== "success") {
        return {
          ok: false,
          errorCode: String(data.errorCode ?? "UNKNOWN"),
          errorMessage: String(data.errorMessage ?? "Iyzico refund failed"),
        };
      }
      return { ok: true, refundId: String(data.paymentTransactionId ?? "") };
    } catch (err) {
      return {
        ok: false,
        errorCode: "NETWORK_ERROR",
        errorMessage: err instanceof Error ? err.message : "fetch failed",
      };
    }
  }
}

// ─── Mock adapter (env yoksa) ────────────────────────────────────────

class MockIyzicoAdapter implements IyzicoAdapter {
  async init(input: IyzicoInitInput): Promise<IyzicoInitResult> {
    return {
      ok: true,
      conversationId: input.paymentId,
      paymentPageUrl: `${input.callbackUrl}?token=MOCK-${input.paymentId}`,
      providerToken: `MOCK-${input.paymentId}`,
    };
  }
  verifyCallback(): boolean {
    // Mock'ta signature yok — mevcut MAGIC_OTP akışı zaten 403 ile prod'da kapalı.
    return process.env.NODE_ENV !== "production";
  }
  verifyWebhookSignature(): boolean {
    return process.env.NODE_ENV !== "production";
  }
  async refund(input: { paymentId: string; amount: number }) {
    return { ok: true as const, refundId: `MOCK-REFUND-${input.paymentId}` };
  }
}

// ─── Public ──────────────────────────────────────────────────────────

const apiKey = process.env.IYZICO_API_KEY;
const secretKey = process.env.IYZICO_SECRET_KEY;
const baseUrl = process.env.IYZICO_BASE_URL ?? "https://sandbox-api.iyzipay.com";

export const iyzicoAdapter: IyzicoAdapter =
  apiKey && secretKey
    ? new RealIyzicoAdapter(apiKey, secretKey, baseUrl)
    : new MockIyzicoAdapter();

export function iyzicoConfigured(): boolean {
  return !!apiKey && !!secretKey;
}
