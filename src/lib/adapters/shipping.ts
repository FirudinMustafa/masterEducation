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

export interface ShippingAdapter {
  quote(input: {
    weightKg: number;
    city: string;
  }): Promise<ShippingQuote>;
  createLabel(input: {
    orderNumber: string;
    recipientName: string;
    phone: string;
    city: string;
    address: string;
  }): Promise<ShippingLabel>;
}

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
}

export const shippingAdapter: ShippingAdapter = new MockShippingAdapter();
