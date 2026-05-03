import { describe, expect, it } from "vitest";
import { ordersToCsv, orderItemsToCsv } from "@/lib/adapters/accounting";

type OrderForExport = Parameters<typeof ordersToCsv>[0][number];

function makeOrder(overrides: Partial<OrderForExport> = {}): OrderForExport {
  const defaults = {
    id: "o1",
    orderNumber: "ME-TEST-0001",
    createdAt: new Date("2026-04-22T10:00:00Z"),
    userId: "u1",
    addressId: "a1",
    status: "DELIVERED",
    paymentMethod: "CREDIT_CARD",
    paymentStatus: "PAID",
    subtotal: 200,
    discountTotal: 20,
    vatTotal: 9,
    shippingCost: 30,
    total: 219,
    note: null,
    adminNote: null,
    guestEmail: null,
    shippingName: "Test Kullanici",
    shippingCity: "Istanbul",
    shippingAddress: "Test Mah. 1",
    shippingPhone: "05551112233",
    trackingNumber: null,
    shippedAt: null,
    updatedAt: new Date(),
    items: [
      {
        id: "i1",
        orderId: "o1",
        productId: "p1",
        productName: "Kitap A",
        productSku: "SKU-A",
        quantity: 2,
        unitPrice: 100,
        discountPct: 10,
        vatRate: 5,
        vatAmount: 9,
        lineTotal: 180,
      },
    ],
    user: {
      id: "u1",
      email: "customer@test.local",
      name: "Test Customer",
      passwordHash: "",
      phone: null,
      role: "CUSTOMER",
      emailVerified: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      dealer: null,
    },
  } as unknown as OrderForExport;
  return { ...defaults, ...overrides } as OrderForExport;
}

describe("accounting CSV", () => {
  it("includes VAT columns in orders header", () => {
    const csv = ordersToCsv([]);
    expect(csv).toContain("KDV");
    expect(csv).toContain("Net (KDV Haric)");
  });

  it("writes VAT amount and net ex-VAT for an order", () => {
    const csv = ordersToCsv([makeOrder()]);
    const [, row] = csv.split("\n");
    // columns: ...;Ara Toplam;Iskonto;KDV;Net;Kargo;Toplam
    expect(row).toContain("200.00"); // subtotal
    expect(row).toContain("20.00"); // discount
    expect(row).toContain("9.00"); // vat
    expect(row).toContain("171.00"); // net ex vat = subtotal-discount-vat
    expect(row).toContain("30.00"); // shipping
    expect(row).toContain("219.00"); // total
  });

  it("includes VAT rate and amount in items export", () => {
    const csv = orderItemsToCsv([makeOrder()]);
    const [header, row] = csv.split("\n");
    expect(header).toContain("KDV %");
    expect(header).toContain("KDV Tutar");
    expect(row).toContain("5.00");
    expect(row).toContain("9.00");
  });

  it("escapes semicolons and quotes", () => {
    const csv = ordersToCsv([
      makeOrder({ shippingName: "Musteri; test \"A\"" }),
    ]);
    // shippingName doesn't appear in orders CSV, but user.name does — swap
    // Use user.name instead for this scenario
    const csv2 = ordersToCsv([
      makeOrder({
        user: {
          ...makeOrder().user,
          name: "Musteri; test \"A\"",
        } as OrderForExport["user"],
      }),
    ]);
    expect(csv2).toContain('"Musteri; test ""A"""');
    void csv;
  });
});
