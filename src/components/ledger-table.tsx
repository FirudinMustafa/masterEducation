import Link from "next/link";
import type { LedgerKind } from "@prisma/client";

const KIND_LABELS: Record<LedgerKind, string> = {
  ORDER_DEBIT: "Sipariş",
  ORDER_CANCEL_CREDIT: "Sipariş İptali",
  PAYMENT_CREDIT: "Tahsilat",
  MANUAL_ADJUSTMENT: "Manuel Ayarlama",
  RETURN_CREDIT: "İade Alacağı",
};

const KIND_COLORS: Record<LedgerKind, string> = {
  ORDER_DEBIT: "bg-amber-100 text-amber-700",
  ORDER_CANCEL_CREDIT: "bg-blue-100 text-blue-700",
  PAYMENT_CREDIT: "bg-emerald-100 text-emerald-700",
  MANUAL_ADJUSTMENT: "bg-gray-100 text-gray-700",
  RETURN_CREDIT: "bg-blue-100 text-blue-700",
};

export interface LedgerRow {
  id: string;
  kind: LedgerKind;
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  orderNumber?: string | null;
  reference: string | null;
  note: string | null;
  createdAt: Date;
}

interface LedgerTableProps {
  rows: LedgerRow[];
  orderLinkBase?: string;
}

export function LedgerTable({ rows, orderLinkBase }: LedgerTableProps) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
        Henuz ekstre hareketi yok.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Tarih
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Tur
              </th>
              <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                Açıklama
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="p-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("tr-TR")}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${KIND_COLORS[r.kind]}`}
                    >
                      {KIND_LABELS[r.kind]}
                    </span>
                  </td>
                  <td className="p-3 text-gray-700">
                    {r.orderId && r.orderNumber && orderLinkBase ? (
                      <Link
                        href={`${orderLinkBase}/${r.orderId}`}
                        className="text-brand-gold-dark hover:underline font-medium"
                      >
                        {r.orderNumber}
                      </Link>
                    ) : r.orderNumber ? (
                      <span className="font-medium">{r.orderNumber}</span>
                    ) : null}
                    {r.note && (
                      <p
                        className={`text-xs text-gray-500 ${r.orderNumber ? "mt-0.5" : ""}`}
                      >
                        {r.note}
                      </p>
                    )}
                    {r.reference && (
                      <p className="text-xs text-gray-400 font-mono">
                        ref: {r.reference}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
