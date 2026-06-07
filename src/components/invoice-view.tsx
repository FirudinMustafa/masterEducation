import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  BRAND,
  LEGAL_SELLER,
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
}

export function InvoiceView({ order, mode, backHref }: InvoiceViewProps) {
  // "FATURA" yazmiyoruz — gercek e-Arsiv entegrasyonu yapilana kadar bu
  // ekran sadece sipariş kayıt çıkışidir (yasal baglayiciligi yoktur).
  const title = mode === "invoice" ? "SIPARIS OZETI" : "TESLIM FISI";
  const isDeliveryNote = mode === "delivery-note";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 bg-white">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <PrintButtons
        backHref={backHref}
        pdfHref={
          isDeliveryNote
            ? `/api/orders/${order.id}/teslim-fisi/pdf`
            : `/api/orders/${order.id}/pdf`
        }
      />

      <div className="border border-gray-300 p-8 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-300 pb-4 mb-6">
          {isDeliveryNote ? (
            <div className="max-w-md">
              <h1 className="text-lg font-bold text-brand-black">
                {LEGAL_SELLER.title}
              </h1>
              <p className="text-gray-600 mt-1 text-xs">{LEGAL_SELLER.address}</p>
              <p className="text-gray-600 text-xs">
                Vergi Dairesi: {LEGAL_SELLER.taxOffice} · VKN: {LEGAL_SELLER.taxNumber}
              </p>
              <p className="text-gray-600 text-xs">Tel: {LEGAL_SELLER.phone}</p>
            </div>
          ) : (
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
          )}
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

        {/* Fiyat/toplam bölümü kaldırıldı — çıktıda tutar gösterilmez (2026-06-08). */}

        {order.note && (
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-600">
            <p className="font-semibold mb-1">Musteri Notu</p>
            <p>{order.note}</p>
          </div>
        )}

        {isDeliveryNote && (
          <>
            <div className="mt-6 border border-gray-300 rounded p-4">
              <p className="font-semibold text-gray-700 uppercase text-xs mb-3">
                Sevkiyat Bilgileri
              </p>
              <div className="space-y-3 text-sm">
                {[
                  "Teslim Şekli",
                  "Araç Plakası",
                  "Dorse Plakası",
                  "Şoför Adı Soyadı",
                  "Şoför TC No",
                ].map((label) => (
                  <div key={label} className="flex items-end gap-3">
                    <span className="w-32 shrink-0 text-gray-600">{label}</span>
                    <span className="flex-1 border-b border-gray-400 h-5" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-8">
              <div>
                <p className="font-semibold text-gray-700 text-sm mb-12">
                  Teslim Eden
                </p>
                <p className="border-t border-gray-700 pt-1 text-xs text-gray-500">
                  Ad Soyad / İmza
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 text-sm mb-12">
                  Teslim Alan
                </p>
                <p className="border-t border-gray-700 pt-1 text-xs text-gray-500">
                  Ad Soyad / İmza
                </p>
              </div>
            </div>
          </>
        )}

        {!isDeliveryNote && (
          <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 text-center">
            Bu belge siparişinizin kayıt ozetidir. Resmi e-Arsiv / e-Fatura
            belgeniz siparişiniz onaylandiktan sonra ayrica email adresinize
            iletilir.
          </div>
        )}
      </div>
    </div>
  );
}
