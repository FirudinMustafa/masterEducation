import Link from "next/link";
import type { Metadata } from "next";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import * as kolaybi from "@/lib/adapters/kolaybi";
import { InvoiceRetryButton } from "@/components/admin/invoice-retry-button";

export const metadata: Metadata = { title: "Faturalar - Admin" };

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING: "Bekleniyor",
  SENT: "Gönderildi",
  FAILED: "Başarısız",
  CANCELLED: "İptal",
};

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

function isInvoiceStatus(s: string | undefined): s is InvoiceStatus {
  return s === "PENDING" || s === "SENT" || s === "FAILED" || s === "CANCELLED";
}

export default async function AdminInvoicesPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const statusFilter = isInvoiceStatus(status) ? status : undefined;

  const where: Prisma.InvoiceWhereInput = statusFilter
    ? { status: statusFilter }
    : {};

  const [invoices, counts] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            user: {
              select: {
                name: true,
                email: true,
                dealer: { select: { companyName: true } },
              },
            },
          },
        },
      },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count]),
  ) as Record<InvoiceStatus, number>;

  const total = Object.values(countByStatus).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            Faturalar
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            KolayBi e-fatura kayıtları. Sipariş DELIVERED&apos;a geçince otomatik
            tetiklenir; başarısız olanlar 30 dk&apos;da bir cron ile retry edilir.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!kolaybi.isConfigured() && !kolaybi.isMockMode() && (
            <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
              DRYRUN — KolayBi env yok
            </span>
          )}
          {kolaybi.isMockMode() && (
            <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
              MOCK MODE
            </span>
          )}
          {kolaybi.isConfigured() && (
            <span className="inline-flex px-3 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700">
              CANLI
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Link
          href="/admin/faturalar"
          className={`bg-white rounded-xl border p-4 ${!statusFilter ? "border-brand-gold ring-2 ring-brand-gold/30" : "border-gray-200 hover:border-gray-300"}`}
        >
          <div className="text-xs text-gray-500">Tümü</div>
          <div className="text-2xl font-bold text-brand-black mt-1">{total}</div>
        </Link>
        {(["PENDING", "SENT", "FAILED", "CANCELLED"] as InvoiceStatus[]).map((s) => (
          <Link
            key={s}
            href={`/admin/faturalar?status=${s}`}
            className={`bg-white rounded-xl border p-4 ${statusFilter === s ? "border-brand-gold ring-2 ring-brand-gold/30" : "border-gray-200 hover:border-gray-300"}`}
          >
            <div className="text-xs text-gray-500">{STATUS_LABELS[s]}</div>
            <div className="text-2xl font-bold text-brand-black mt-1">
              {countByStatus[s] ?? 0}
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Sipariş</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Bayi</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Belge No</th>
              <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Deneme</th>
              <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Oluşma</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Henüz fatura yok.
                </td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-3">
                  <Link
                    href={`/admin/siparisler/${inv.order.id}`}
                    className="text-brand-black hover:underline font-mono text-xs"
                  >
                    {inv.order.orderNumber}
                  </Link>
                </td>
                <td className="p-3 text-gray-700">
                  {inv.order.user.dealer?.companyName ?? inv.order.user.name}
                </td>
                <td className="p-3 text-right">
                  {formatPrice(Number(inv.totalAmount))} {inv.currency}
                </td>
                <td className="p-3 text-gray-600 font-mono text-xs">
                  {inv.externalId ?? "—"}
                </td>
                <td className="p-3 text-center text-gray-600">
                  {inv.attemptCount}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_BADGE[inv.status]}`}
                    title={inv.errorMessage ?? undefined}
                  >
                    {STATUS_LABELS[inv.status]}
                  </span>
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {new Date(inv.createdAt).toLocaleString("tr-TR")}
                </td>
                <td className="p-3 text-right">
                  <InvoiceRetryButton invoiceId={inv.id} status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
