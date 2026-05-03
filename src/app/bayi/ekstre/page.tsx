import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { LedgerTable, type LedgerRow } from "@/components/ledger-table";

export const metadata: Metadata = { title: "Cari Ekstre - Bayi Paneli" };

export default async function DealerStatementPage() {
  const session = await auth();
  if (!session?.user?.dealerId) {
    redirect("/giris");
  }
  // Cari ekstre PREPAID modunda anlamsiz — sayfaya direkt erisim engellensin.
  if (session.user.dealerPaymentTerms === "PREPAID") {
    redirect("/bayi");
  }
  const dealerId = session.user.dealerId;

  const [dealer, ledgerRaw] = await Promise.all([
    prisma.dealer.findUnique({
      where: { id: dealerId },
      select: {
        creditLimit: true,
        currentBalance: true,
        companyName: true,
      },
    }),
    prisma.dealerLedger.findMany({
      where: { dealerId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!dealer) redirect("/bayi");

  const orderIds = ledgerRaw
    .map((l) => l.orderId)
    .filter((v): v is string => !!v);
  const orderMap = orderIds.length
    ? new Map(
        (
          await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        ).map((o) => [o.id, o.orderNumber])
      )
    : new Map<string, string>();

  const rows: LedgerRow[] = ledgerRaw.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount),
    balanceAfter: Number(r.balanceAfter),
    orderId: r.orderId,
    orderNumber: r.orderId ? orderMap.get(r.orderId) ?? null : null,
    reference: r.reference,
    note: r.note,
    createdAt: r.createdAt,
  }));

  const creditLimit = Number(dealer.creditLimit);
  const balance = Number(dealer.currentBalance);
  const available = creditLimit - balance;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Cari Ekstre
        </h1>
        <p className="text-sm text-gray-500 mt-1">{dealer.companyName}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Kredi Limiti</p>
          <p className="text-xl font-bold text-brand-black mt-1">
            {formatPrice(creditLimit)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Guncel Bakiye</p>
          <p className="text-xl font-bold text-amber-700 mt-1">
            {formatPrice(balance)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Kullanilabilir</p>
          <p
            className={`text-xl font-bold mt-1 ${
              available >= 0 ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {formatPrice(available)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="/api/dealer/statement?format=xlsx"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark"
        >
          Ekstre Excel
        </a>
        <a
          href="/api/dealer/statement?format=csv"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          CSV
        </a>
      </div>

      <LedgerTable rows={rows} orderLinkBase="/bayi/siparisler" />
    </div>
  );
}
