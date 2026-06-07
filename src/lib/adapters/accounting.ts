import type { Order, OrderItem, User, Dealer } from "@prisma/client";

type OrderForExport = Order & {
  items: OrderItem[];
  user: User & { dealer: Dealer | null };
};

const HEADERS = [
  "Sipariş No",
  "Tarih",
  "Musteri",
  "Email",
  "Bayi",
  "Vergi No",
  "Ödeme",
  "Durum",
  "Ara Toplam",
  "İskonto",
  "KDV",
  "Net (KDV Haric)",
  "Kargo",
  "Toplam",
];

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  if (/[",;\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ordersToCsv(orders: OrderForExport[]): string {
  const lines = [HEADERS.join(";")];
  for (const o of orders) {
    const subtotal = Number(o.subtotal);
    const discount = Number(o.discountTotal);
    const vat = Number(o.vatTotal);
    const shipping = Number(o.shippingCost);
    const total = Number(o.total);
    const netBeforeShipping = subtotal - discount;
    const netExVat = Math.round((netBeforeShipping - vat) * 100) / 100;
    lines.push(
      [
        csvEscape(o.orderNumber),
        csvEscape(formatDate(o.createdAt)),
        csvEscape(o.user.name),
        csvEscape(o.user.email),
        csvEscape(o.user.dealer?.companyName ?? ""),
        csvEscape(o.user.dealer?.taxNumber ?? ""),
        csvEscape(o.paymentMethod),
        csvEscape(o.status),
        csvEscape(subtotal.toFixed(2)),
        csvEscape(discount.toFixed(2)),
        csvEscape(vat.toFixed(2)),
        csvEscape(netExVat.toFixed(2)),
        csvEscape(shipping.toFixed(2)),
        csvEscape(total.toFixed(2)),
      ].join(";")
    );
  }
  return lines.join("\n");
}

const ITEM_HEADERS = [
  "Sipariş No",
  "Tarih",
  "ISBN",
  "Ürün",
  "Adet",
  "Birim Fiyat",
  "İskonto %",
  "KDV %",
  "KDV Tutar",
  "Satir Toplam",
];

export function orderItemsToCsv(orders: OrderForExport[]): string {
  const lines = [ITEM_HEADERS.join(";")];
  for (const o of orders) {
    for (const item of o.items) {
      lines.push(
        [
          csvEscape(o.orderNumber),
          csvEscape(formatDate(o.createdAt)),
          csvEscape(item.productSku),
          csvEscape(item.productName),
          csvEscape(item.quantity),
          csvEscape(Number(item.unitPrice).toFixed(2)),
          csvEscape(Number(item.discountPct).toFixed(2)),
          csvEscape(Number(item.vatRate).toFixed(2)),
          csvEscape(Number(item.vatAmount).toFixed(2)),
          csvEscape(Number(item.lineTotal).toFixed(2)),
        ].join(";")
      );
    }
  }
  return lines.join("\n");
}
