"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { OrderStatus, PaymentMethod } from "@prisma/client";
import { OrdersBulkStatusModal, type BulkPatch } from "./orders-bulk-status-modal";

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  total: number;
  createdAt: Date;
}

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

interface Props {
  orders: OrderRow[];
}

export function OrdersTable({ orders }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const allChecked = useMemo(
    () => orders.length > 0 && orders.every((o) => selected.has(o.id)),
    [orders, selected]
  );

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const next = new Set(prev);
      for (const o of orders) next.add(o.id);
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function applyPatch(patch: BulkPatch) {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/orders/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [...selected], ...patch }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      succeeded?: number;
      failed?: { id: string; error: string }[];
      total?: number;
    };
    if (!res.ok) {
      setError(data.error ?? "Toplu işlem başarısız.");
      return;
    }
    const failed = data.failed ?? [];
    if (failed.length > 0) {
      setInfo(
        `${data.succeeded ?? 0}/${data.total ?? 0} başarılı, ${failed.length} sipariş atlandı (${failed[0]?.error}…).`
      );
    } else {
      setInfo(`${data.succeeded ?? 0} sipariş güncellendi.`);
    }
    setShowModal(false);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      {/* Mobile: kart liste (multi-select desteksiz) */}
      <div className="space-y-3 md:hidden">
        {orders.map((o) => (
          <Link
            key={o.id}
            href={`/admin/siparisler/${o.id}`}
            className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-black text-sm">
                  {o.orderNumber}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {o.customerName} · {o.customerEmail}
                </p>
              </div>
              <span className="shrink-0 font-bold text-brand-black">
                {formatPrice(o.total)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`inline-flex px-2 py-0.5 font-medium rounded-full ${STATUS_COLOR[o.status]}`}
              >
                {ORDER_STATUS_LABELS[o.status] || o.status}
              </span>
              <span className="text-gray-500">
                {PAYMENT_METHOD_LABELS[o.paymentMethod] || o.paymentMethod}
              </span>
              <span className="text-gray-400">· {o.itemCount} urun</span>
              <span className="ml-auto text-gray-400">
                {new Date(o.createdAt).toLocaleDateString("tr-TR")}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: tablo */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Siparis bulunamadi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAll}
                      aria-label="Tumunu sec"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Siparis No
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Musteri
                  </th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">
                    Urun
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Odeme
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Durum
                  </th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                    Tutar
                  </th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                    Tarih
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 ${
                      selected.has(o.id) ? "bg-brand-gold-light/10" : ""
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleOne(o.id)}
                        aria-label={`${o.orderNumber} sec`}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/admin/siparisler/${o.id}`}
                        className="font-medium text-brand-black hover:text-brand-gold-dark"
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-brand-black">
                          {o.customerName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.customerEmail}
                        </p>
                      </div>
                    </td>
                    <td className="p-3 text-center text-gray-600">
                      {o.itemCount}
                    </td>
                    <td className="p-3 text-gray-600">
                      {PAYMENT_METHOD_LABELS[o.paymentMethod] ||
                        o.paymentMethod}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLOR[o.status]}`}
                      >
                        {ORDER_STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold">
                      {formatPrice(o.total)}
                    </td>
                    <td className="p-3 text-right text-gray-500 text-xs">
                      {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-brand-black">
                {selected.size} siparis secildi
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <button
              onClick={() => setShowModal(true)}
              disabled={pending}
              className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              Toplu Durum / Kargo
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <OrdersBulkStatusModal
          count={selected.size}
          onClose={() => setShowModal(false)}
          onApply={applyPatch}
          pending={pending}
        />
      )}
    </>
  );
}
