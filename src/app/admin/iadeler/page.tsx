import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReturnStatus } from "@prisma/client";
import { formatPrice } from "@/lib/utils";
import { ReturnActions } from "@/components/admin/return-actions";

export const metadata: Metadata = { title: "İadeler - Admin" };

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Beklemede", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Onaylandı", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reddedildi", cls: "bg-rose-100 text-rose-700" },
};

interface PageProps {
  searchParams: Promise<{ durum?: string }>;
}

export default async function AdminReturnsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const status = params.durum || "";

  const where: { status?: ReturnStatus } = {};
  if (status === "PENDING" || status === "APPROVED" || status === "REJECTED") {
    where.status = status;
  }

  const returns = await prisma.return.findMany({
    where,
    include: {
      items: true,
      order: { select: { orderNumber: true } },
      dealer: { select: { companyName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const filters = [
    { value: "", label: "Tümü" },
    { value: "PENDING", label: "Beklemede" },
    { value: "APPROVED", label: "Onaylandı" },
    { value: "REJECTED", label: "Reddedildi" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-brand-black">İadeler</h1>
        <p className="text-sm text-gray-500 mt-1">{returns.length} iade talebi</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/iadeler${f.value ? `?durum=${f.value}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              status === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {returns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          İade talebi bulunmuyor.
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => {
            const st = STATUS[r.status] ?? STATUS.PENDING;
            return (
              <div
                key={r.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gray-50 border-b border-gray-100">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <p className="text-xs text-gray-500">İade No</p>
                      <p className="font-semibold text-brand-black">{r.returnNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Bayi</p>
                      <p className="text-sm">{r.dealer.companyName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Sipariş</p>
                      <p className="text-sm">{r.order.orderNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Tarih</p>
                      <p className="text-sm">
                        {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-brand-black">
                      {formatPrice(Number(r.totalAmount))}
                    </span>
                    <span
                      className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-1.5">
                  {r.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">{it.quantity}x</span>
                      <span className="text-brand-black">{it.productName}</span>
                      <span className="text-gray-400 text-xs ml-auto">
                        {formatPrice(Number(it.lineTotal))}
                      </span>
                    </div>
                  ))}
                  {r.reason && (
                    <p className="mt-2 text-xs text-gray-500">
                      Sebep: <span className="text-gray-700">{r.reason}</span>
                    </p>
                  )}
                  {r.adminNote && (
                    <p className="mt-1 text-xs text-gray-500">
                      Yönetim notu: <span className="text-gray-700">{r.adminNote}</span>
                    </p>
                  )}
                  {r.status === "PENDING" && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <ReturnActions returnId={r.id} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
