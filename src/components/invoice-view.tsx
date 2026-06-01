import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  BRAND,
} from "@/lib/constants";
import { PrintButtons } from "@/components/invoice-print";

export interface InvoiceOrder {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  shippingCost: number;
  total: number;
  note: string | null;
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPhone: string;
  customerEmail: string;
  dealer?: {
    companyName: string;
    taxOffice: string;
    taxNumber: string;
  } | null;
  items: Array<{
    id: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
    discountPct: number;
    vatRate: number;
    vatAmount: number;
    lineTotal: number;
  }>;
}

interface InvoiceViewProps {
  order: InvoiceOrder;
  mode: "invoice" | "delivery-note";
  backHref: string;
  /**
   * Fiyat/tutar/KDV sütunları ve toplamlar yalnız bu true iken gösterilir.
   * Admin görünümünde true (default); müşteri/bayi görünümünde false geçilir —
   * fiyatlar sistem genelinde müşteri/bayiden gizlenir.
   */
  showPrices?: boolean;
}

export function InvoiceView({ order, mode, backHref, showPrices = true }: InvoiceViewProps) {
  // "FATURA" yazmiyoruz — gercek e-Arsiv entegrasyonu yapilana kadar bu
  // ekran sadece sipariş kayıt çıkışidir (yasal baglayiciligi yoktur).
  const title = mode === "invoice" ? "SIPARIS OZETI" : "TESLIM FISI";

  // Aggregate VAT breakdown by rate
  const vatBreakdown = new Map<number, { base: number; vat: number }>();
  for (const item of order.items) {
    const existing = vatBreakdown.get(item.vatRate) ?? { base: 0, vat: 0 };
    existing.base += item.lineTotal - item.vatAmount;
    existing.vat += item.vatAmount;
    vatBreakdown.set(item.vatRate, existing);
  }

  const netBeforeShipping = order.subtotal - order.discountTotal;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <PrintButtons backHref={backHref} pdfHref={`/api/orders/${order.id}/pdf`} />

      <div className="border border-gray-300 p-8 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-300 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-black">{BRAND.name}</h1>
            <p className="text-gray-600 mt-1">{BRAND.email}</p>
            <p className="text-gray-600">{BRAND.phone}</p>
            <p className="text-gray-600">{BRAND.address}</p>
            {(BRAND.taxOffice || BRAND.taxNumber) && (
              <p className="text-gray-600 mt-1 text-xs">
                {BRAND.taxOffice && <>VD: {BRAND.taxOffice}</>}
                {BRAND.taxOffice && BRAND.taxNumber && " · "}
                {BRAND.taxNumber && <>VKN: {BRAND.taxNumber}</>}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{title}</p>
            <p className="text-gray-600 mt-1">
              No: <span className="font-mono">{order.orderNumber}</span>
            </p>
            <p className="text-gray-600">
              Tarih: {new Date(order.createdAt).toLocaleDateString("tr-TR")}
            </p>
          </div>
        </div>

        {/* Customer */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h2 className="font-semibold text-gray-700 uppercase text-xs mb-2">
              Alici
            </h2>
            <div className="text-gray-800">
              <p className="font-semibold">{order.shippingName}</p>
              {order.dealer && (
                <>
                  <p className="text-xs text-gray-600">
                    {order.dealer.companyName}
                  </p>
                  <p className="text-xs text-gray-600">
                    VD: {order.dealer.taxOffice} · VKN: {order.dealer.taxNumber}
                  </p>
                </>
              )}
              <p>{order.customerEmail}</p>
              <p>{order.shippingPhone}</p>
            </div>
          </div>
          <div>
            <h2 className="font-semibold text-gray-700 uppercase text-xs mb-2">
              Teslimat Adresi
            </h2>
            <div className="text-gray-800">
              <p>{order.shippingAddress}</p>
              <p>{order.shippingCity}</p>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              <p>
                Sipariş Durumu:{" "}
                <strong>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </strong>
              </p>
              <p>
                Ödeme:{" "}
                <strong>
                  {PAYMENT_METHOD_LABELS[order.paymentMethod] ??
                    order.paymentMethod}
                </strong>
                {" · "}
                {order.paymentStatus}
              </p>
            </div>
          </div>
        </div>

        {/* Items */}
        <table className="w-full mb-4 border-collapse">
          <thead>
            <tr className="bg-gray-100 text-xs uppercase text-gray-700">
              <th className="text-left p-2 border border-gray-300">Ürün</th>
              <th className="text-left p-2 border border-gray-300">ISBN</th>
              <th className="text-right p-2 border border-gray-300">Adet</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td className="p-2 border border-gray-300">{i.productName}</td>
                <td className="p-2 border border-gray-300 font-mono text-xs">
                  {i.productSku}
                </td>
                <td className="p-2 border border-gray-300 text-right">
                  {i.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals — only on invoice, and only when prices are visible */}
        {showPrices && mode === "invoice" && (
          <div className="flex justify-end">
            <table className="text-sm w-80">
              <tbody>
                <tr>
                  <td className="py-1 text-gray-600">Ara Toplam</td>
                  <td className="py-1 text-right">
                    {formatPrice(order.subtotal)}
                  </td>
                </tr>
                {order.discountTotal > 0 && (
                  <tr>
                    <td className="py-1 text-gray-600">İskonto</td>
                    <td className="py-1 text-right text-emerald-700">
                      -{formatPrice(order.discountTotal)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="py-1 text-gray-600">Net Mal Bedeli</td>
                  <td className="py-1 text-right">
                    {formatPrice(netBeforeShipping - order.vatTotal)}
                  </td>
                </tr>
                {[...vatBreakdown.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([rate, v]) => (
                    <tr key={rate}>
                      <td className="py-1 text-gray-600">
                        KDV %{rate} ({formatPrice(v.base)})
                      </td>
                      <td className="py-1 text-right">
                        {formatPrice(v.vat)}
                      </td>
                    </tr>
                  ))}
                <tr>
                  <td className="py-1 text-gray-600">Kargo</td>
                  <td className="py-1 text-right">
                    {formatPrice(order.shippingCost)}
                  </td>
                </tr>
                <tr className="border-t-2 border-gray-300 font-bold text-base">
                  <td className="py-2">GENEL TOPLAM</td>
                  <td className="py-2 text-right">
                    {formatPrice(order.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {order.note && (
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-600">
            <p className="font-semibold mb-1">Musteri Notu</p>
            <p>{order.note}</p>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
          Bu belge siparişinizin kayıt ozetidir. Resmi e-Arsiv / e-Fatura
          belgeniz siparişiniz onaylandiktan sonra ayrica email adresinize
          iletilir.
        </div>
      </div>
    </div>
  );
}
