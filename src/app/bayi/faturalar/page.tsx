import Link from "next/link";
import type { Metadata } from "next";
import type { InvoiceStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Faturalarım - Bayi" };

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: "Hazırlanıyor",
  SENT: "Kesildi",
  FAILED: "Hata",
  CANCELLED: "İptal",
};

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default async function DealerInvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/giris");

  // JWT'deki dealerId stale olabilir (yeni başvuru veya admin tarafı role
  // değişimi sonrası). Fresh DB fetch — /bayi/belgeler ile aynı pattern.
  const dealer = await prisma.dealer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!dealer) redirect("/bayi-basvuru");
  const dealerId = dealer.id;

  // Bayinin kendi siparişleriyle bağlı faturalar.
  const invoices = await prisma.invoice.findMany({
    where: {
      order: { user: { dealer: { id: dealerId } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      order: { select: { id: true, orderNumber: true, total: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Faturalarım
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          KolayBi&apos;de tarafınıza kesilen e-faturalar.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Sipariş</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Belge No</th>
              <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  Henüz fatura yok. Sipariş teslim edildiğinde burada görünür.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-3">
                  <Link
                    href={`/bayi/siparisler/${inv.order.id}/fatura`}
                    className="text-brand-black hover:underline font-mono text-xs"
                  >
                    {inv.order.orderNumber}
                  </Link>
                </td>
                <td className="p-3 text-right">
                  {formatPrice(Number(inv.totalAmount))} {inv.currency}
                </td>
                <td className="p-3 text-gray-600 font-mono text-xs">
                  {inv.externalId ?? "—"}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE[inv.status]}`}
                  >
                    {STATUS_LABELS[inv.status]}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {new Date(inv.createdAt).toLocaleDateString("tr-TR")}
                </td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/bayi/siparisler/${inv.order.id}/fatura`}
                      className="text-xs text-gray-600 hover:text-brand-black hover:underline"
                    >
                      Goruntule
                    </Link>
                    <a
                      href={`/api/orders/${inv.order.id}/pdf`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-gold-dark hover:underline"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      PDF
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
