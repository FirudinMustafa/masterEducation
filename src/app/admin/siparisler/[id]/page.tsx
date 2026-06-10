import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { carrierLabel } from "@/lib/cargo-carriers";
import { OrderStatusForm } from "@/components/admin/order-status-form";
import { OrderInvoiceButton } from "@/components/admin/order-invoice-button";

export const metadata: Metadata = { title: "Sipariş Detayi - Admin" };

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Bekliyor",
  SENT: "Aktarıldı (taslak)",
  FAILED: "Başarısız",
  CANCELLED: "İptal",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: {
        include: { dealer: { select: { id: true, companyName: true } } },
      },
      address: true,
      items: true,
      invoice: true,
    },
  });

  if (!order) notFound();

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/siparisler" className="text-sm text-gray-500 hover:text-brand-black">
          &larr; Siparişler
        </Link>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            {order.orderNumber}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {new Date(order.createdAt).toLocaleString("tr-TR")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/orders/${order.id}/pdf`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            PDF İndir
          </a>
          <Link
            href={`/admin/siparisler/${order.id}/fatura`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Onizleme
          </Link>
          <Link
            href={`/admin/siparisler/${order.id}/irsaliye`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Teslim Fisi
          </Link>
          <a
            href={`/api/admin/orders/${order.id}/siparis-formu`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
            </svg>
            Sipariş Formu (Excel)
          </a>
          <span className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
          </span>
          {order.paymentMethod === "OPEN_ACCOUNT" && (
            <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
              Ödeme cari hesaptan takip edilir (ekstre)
            </span>
          )}
          <span className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-amber-100 text-amber-700">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Musteri</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Ad" value={order.user.name} />
            <Row label="Email" value={order.user.email} />
            <Row label="Telefon" value={order.user.phone ?? "-"} />
            {order.user.dealer && (
              <div className="flex justify-between gap-4 pt-2 border-t border-gray-100">
                <dt className="text-gray-500">Bayi</dt>
                <dd>
                  <Link
                    href={`/admin/bayiler/${order.user.dealer.id}`}
                    className="font-medium text-brand-gold-dark hover:underline"
                  >
                    {order.user.dealer.companyName}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Teslimat</h2>
          <div className="text-sm text-gray-700 space-y-1">
            <p className="font-medium text-brand-black">{order.shippingName}</p>
            <p>{order.shippingPhone}</p>
            <p>{order.shippingAddress}</p>
            <p className="text-gray-500">
              {order.address.district && `${order.address.district}/`}
              {order.shippingCity}
              {order.address.postalCode && ` ${order.address.postalCode}`}
            </p>
            {order.schoolName && (
              <p className="pt-2 mt-1 border-t border-gray-100">
                <span className="text-gray-500">Okul: </span>
                <span className="font-medium text-brand-black">{order.schoolName}</span>
              </p>
            )}
            {order.trackingNumber && (
              <p className="pt-2 mt-1 border-t border-gray-100 text-xs">
                <span className="text-gray-500">
                  {order.trackingCarrier
                    ? carrierLabel(order.trackingCarrier, order.trackingCarrierName)
                    : "Kargo"}
                  :{" "}
                </span>
                <Link
                  href={`/kargo-takip/${order.trackingNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-brand-gold-dark hover:underline"
                >
                  {order.trackingNumber}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {order.user.dealer && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-brand-black">KolayBi Fatura Kaydı</h2>
              <p className="text-xs text-gray-500 mt-1">
                KolayBi&apos;ye <strong>taslak</strong> olarak aktarılır; resmi e-fatura
                KolayBi panelinden elle kesilir. DELIVERED&apos;da otomatik tetiklenir.
              </p>
            </div>
            {order.invoice && (
              <span
                className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${
                  order.invoice.status === "SENT"
                    ? "bg-emerald-100 text-emerald-700"
                    : order.invoice.status === "FAILED"
                      ? "bg-red-100 text-red-700"
                      : order.invoice.status === "CANCELLED"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-700"
                }`}
              >
                {INVOICE_STATUS_LABELS[order.invoice.status] ?? order.invoice.status}
              </span>
            )}
          </div>
          {order.invoice ? (
            <>
              <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <dt className="text-gray-500">KolayBi Belge No</dt>
                  <dd className="font-mono text-brand-black mt-0.5">
                    {order.invoice.externalId ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Tutar</dt>
                  <dd className="text-brand-black mt-0.5">
                    {formatPrice(Number(order.invoice.totalAmount))} {order.invoice.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Deneme</dt>
                  <dd className="text-brand-black mt-0.5">{order.invoice.attemptCount}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Aktarım</dt>
                  <dd className="text-brand-black mt-0.5">
                    {order.invoice.syncedAt
                      ? new Date(order.invoice.syncedAt).toLocaleString("tr-TR")
                      : "—"}
                  </dd>
                </div>
              </dl>
              {order.invoice.errorMessage && (
                <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  {order.invoice.errorMessage}
                </p>
              )}
              {order.invoice.pdfUrl && (
                <a
                  href={order.invoice.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-sm text-brand-gold-dark hover:underline"
                >
                  PDF indir &rarr;
                </a>
              )}
            </>
          ) : (
            <p className="mt-3 text-xs text-gray-500">
              Henüz KolayBi&apos;ye aktarılmadı.
            </p>
          )}
          <OrderInvoiceButton
            orderId={order.id}
            orderStatus={order.status}
            invoiceStatus={order.invoice?.status ?? null}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-brand-black">Ürünler ({order.items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Ürün</th>
              <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">ISBN</th>
              <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Adet</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Birim</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">İskonto</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50">
                <td className="p-3 text-brand-black">{item.productName}</td>
                <td className="p-3 text-center text-gray-500 font-mono text-xs">{item.productSku}</td>
                <td className="p-3 text-center">{item.quantity}</td>
                <td className="p-3 text-right">{formatPrice(Number(item.unitPrice))}</td>
                <td className="p-3 text-right text-emerald-600">%{Number(item.discountPct)}</td>
                <td className="p-3 text-right font-semibold">{formatPrice(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={5} className="p-3 text-right text-gray-500">Ara Toplam</td>
              <td className="p-3 text-right">{formatPrice(Number(order.subtotal))}</td>
            </tr>
            {Number(order.discountTotal) > 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-right text-gray-500">İskonto</td>
                <td className="p-3 text-right text-emerald-600">
                  -{formatPrice(Number(order.discountTotal))}
                </td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="p-3 text-right text-gray-500">Kargo</td>
              <td className="p-3 text-right">{formatPrice(Number(order.shippingCost))}</td>
            </tr>
            <tr className="border-t border-gray-200">
              <td colSpan={5} className="p-3 text-right font-semibold text-brand-black">Toplam</td>
              <td className="p-3 text-right font-bold text-brand-black">
                {formatPrice(Number(order.total))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sadece musteri notu — admin notu zaten asagidaki "Durum Güncelle"
          textbox'inda mevcut, ekstra kart çıkarildi (kullanıcı istegi). */}
      {order.note && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Musteri Notu
          </h3>
          <p className="text-sm text-brand-black">{order.note}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-brand-black mb-4">Durum Güncelle</h2>
        <OrderStatusForm
          orderId={order.id}
          status={order.status}
          trackingNumber={order.trackingNumber}
          trackingCarrier={order.trackingCarrier}
          trackingCarrierName={order.trackingCarrierName}
          estimatedDeliveryAt={order.estimatedDeliveryAt}
          adminNote={order.adminNote}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-brand-black text-right">{value}</dd>
    </div>
  );
}
