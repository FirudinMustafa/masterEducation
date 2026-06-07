/**
 * Shipping adapter — Faz 4.3b.
 *
 * Shipentegra (Türkiye 9 carrier hub'ı: Aras, Yurtiçi, MNG, PTT, Sürat,
 * Kolay Gelsin, HepsiJet, Trendyol Express, UPS) tek API arkasında.
 *
 * Env var'ları:
 *   SHIPENTEGRA_API_KEY    — Bearer token
 *   SHIPENTEGRA_BASE_URL   — default https://api.shipentegra.com/v1
 *   SHIPENTEGRA_WEBHOOK_SECRET — HMAC-SHA256 webhook body için
 *
 * Env yoksa MockShippingAdapter (dev) — gerçek HTTP atılmaz.
 */

import crypto from "crypto";

export type ShippingQuote = {
  carrier: string;
  price: number;
  etaDays: number;
};

export type ShippingLabel = {
  trackingNumber: string;
  carrier: string;
  labelUrl: string;
};

export type ShippingTrackingEvent = {
  occurredAt: Date;
  status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RETURNED" | "FAILED";
  description: string;
  city?: string;
};

export interface ShippingAdapter {
  quote(input: { weightKg: number; city: string }): Promise<ShippingQuote>;
  createLabel(input: {
    orderNumber: string;
    recipientName: string;
    phone: string;
    city: string;
    address: string;
  }): Promise<ShippingLabel>;
  fetchTracking(trackingNumber: string): Promise<ShippingTrackingEvent[]>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

// ─── Mock adapter (env yoksa) ────────────────────────────────────────

class MockShippingAdapter implements ShippingAdapter {
  async quote(input: { weightKg: number; city: string }): Promise<ShippingQuote> {
    const base = 29.9;
    const weightFee = Math.max(0, input.weightKg - 1) * 5;
    const istanbulDiscount = input.city.toLowerCase().includes("istanbul") ? -5 : 0;
    return {
      carrier: "Mock Kargo",
      price: Math.max(0, base + weightFee + istanbulDiscount),
      etaDays: 2,
    };
  }

  async createLabel(input: {
    orderNumber: string;
    recipientName: string;
    phone: string;
    city: string;
    address: string;
  }): Promise<ShippingLabel> {
    void input;
    const tracking = `MOCK-${Date.now()}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;
    return {
      trackingNumber: tracking,
      carrier: "Mock Kargo",
      labelUrl: `https://example.invalid/labels/${tracking}.pdf`,
    };
  }

  async fetchTracking(): Promise<ShippingTrackingEvent[]> {
    return [];
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const MOCK_TEST_SECRET = "shipping-mock-test-secret-2026";
    const expected = crypto
      .createHmac("sha256", MOCK_TEST_SECRET)
      .update(rawBody)
      .digest("hex");
    if (expected.length !== signature.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}

// ─── Real Shipentegra adapter ────────────────────────────────────────

class ShipentegraAdapter implements ShippingAdapter {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private webhookSecret: string | undefined
  ) {}

  private async request<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`shipentegra_${res.status}`);
    }
    return (await res.json()) as T;
  }

  async quote(input: { weightKg: number; city: string }): Promise<ShippingQuote> {
    const data = await this.request<{
      cheapest: { carrierCode: string; price: number; etaDays: number };
    }>("/quote", { weightKg: input.weightKg, city: input.city });
    return {
      carrier: data.cheapest.carrierCode,
      price: data.cheapest.price,
      etaDays: data.cheapest.etaDays,
    };
  }

  async createLabel(input: {
    orderNumber: string;
    recipientName: string;
    phone: string;
    city: string;
    address: string;
  }): Promise<ShippingLabel> {
    const data = await this.request<{
      trackingNumber: string;
      carrierCode: string;
      labelUrl: string;
    }>("/shipments", {
      reference: input.orderNumber,
      recipient: {
        name: input.recipientName,
        phone: input.phone,
        city: input.city,
        address: input.address,
      },
    });
    return {
      trackingNumber: data.trackingNumber,
      carrier: data.carrierCode,
      labelUrl: data.labelUrl,
    };
  }

  async fetchTracking(trackingNumber: string): Promise<ShippingTrackingEvent[]> {
    const data = await this.request<{
      events: Array<{
        occurredAt: string;
        status: ShippingTrackingEvent["status"];
        description: string;
        city?: string;
      }>;
    }>(`/tracking/${encodeURIComponent(trackingNumber)}`, undefined, "GET");
    return data.events.map((e) => ({
      occurredAt: new Date(e.occurredAt),
      status: e.status,
      description: e.description,
      city: e.city,
    }));
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");
    if (expected.length !== signature.length) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
      );
    } catch {
      return false;
    }
  }
}

// ─── Public ──────────────────────────────────────────────────────────

const apiKey = process.env.SHIPENTEGRA_API_KEY;
const baseUrl =
  process.env.SHIPENTEGRA_BASE_URL ?? "https://api.shipentegra.com/v1";
const webhookSecret = process.env.SHIPENTEGRA_WEBHOOK_SECRET;

export const shippingAdapter: ShippingAdapter = apiKey
  ? new ShipentegraAdapter(apiKey, baseUrl, webhookSecret)
  : new MockShippingAdapter();

export function shippingConfigured(): boolean {
  return !!apiKey;
}
