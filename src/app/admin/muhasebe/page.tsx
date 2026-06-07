import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Muhasebe - Admin" };

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default async function AdminAccountingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const defaults = defaultRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;

  const start = new Date(from);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  const [totals, openAccount, topDealers] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: start, lte: end }, status: { not: "CANCELLED" } },
      _sum: { subtotal: true, discountTotal: true, shippingCost: true, total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
        paymentMethod: "OPEN_ACCOUNT",
        status: { not: "CANCELLED" },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.dealer.findMany({
      select: {
        id: true,
        companyName: true,
        creditLimit: true,
        currentBalance: true,
      },
      orderBy: { currentBalance: "desc" },
      take: 10,
    }),
  ]);

  const exportUrl = (type: "orders" | "items", format: "csv" | "xlsx" = "xlsx") =>
    `/api/admin/accounting/export?type=${type}&format=${format}&from=${from}&to=${to}`;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">Muhasebe</h1>
        <p className="text-sm text-gray-500 mt-1">Sipariş ve cari ozeti</p>
      </div>

      <form
        method="get"
        className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-end gap-3"
      >
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Baslangic</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Bitis</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <button
          type="submit"
          className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark"
        >
          Uygula
        </button>
        <a
          href={exportUrl("orders", "xlsx")}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Siparişler Excel
        </a>
        <a
          href={exportUrl("items", "xlsx")}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Satirlar Excel
        </a>
        <a
          href={exportUrl("orders", "csv")}
          className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          CSV
        </a>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Sipariş Sayısi" value={String(totals._count._all)} />
        <Stat label="Ara Toplam" value={formatPrice(Number(totals._sum.subtotal ?? 0))} />
        <Stat label="İskonto" value={formatPrice(Number(totals._sum.discountTotal ?? 0))} />
        <Stat label="Ciro" value={formatPrice(Number(totals._sum.total ?? 0))} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-brand-black mb-3">Acik Hesap</h2>
        <p className="text-sm text-gray-600">
          {openAccount._count._all} sipariş — Toplam:{" "}
          <strong>{formatPrice(Number(openAccount._sum.total ?? 0))}</strong>
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-brand-black">Bayi Bakiye Ozeti</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Bayi</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Limit</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Bakiye</th>
              <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Kullanilabilir</th>
            </tr>
          </thead>
          <tbody>
            {topDealers.map((d) => (
              <tr key={d.id} className="border-b border-gray-50">
                <td className="p-3 font-medium">{d.companyName}</td>
                <td className="p-3 text-right">{formatPrice(Number(d.creditLimit))}</td>
                <td className="p-3 text-right">{formatPrice(Number(d.currentBalance))}</td>
                <td className="p-3 text-right font-semibold">
                  {formatPrice(Number(d.creditLimit) - Number(d.currentBalance))}
                </td>
              </tr>
            ))}
            {topDealers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-gray-500">
                  Bayi yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold text-brand-black mt-1">{value}</p>
    </div>
  );
}
