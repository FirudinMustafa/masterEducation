"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { OrderStatus, PaymentMethod } from "@prisma/client";
import { OrdersBulkStatusModal, type BulkPatch } from "./orders-bulk-status-modal";
import { ConfirmDialog } from "./confirm-dialog";
import { toast } from "@/stores/toast-store";

export interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  dealerCompanyName: string | null;
  schoolName: string | null;
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
  const [resultPopup, setResultPopup] = useState<{
    tone: "success" | "default";
    message: string;
  } | null>(null);
  // Kalıcı silme onayı (tekli veya toplu).
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "single"; id: string; label: string }
    | { kind: "bulk"; ids: string[] }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const allChecked = useMemo(
    () => orders.length > 0 && orders.every((o) => selected.has(o.id)),
    [orders, selected]
  );

  // Toplu modalın ulaşılabilir durum geçişlerini hesaplaması için seçili
  // siparişlerin mevcut durumları.
  const selectedStatuses = useMemo(
    () => orders.filter((o) => selected.has(o.id)).map((o) => o.status),
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
      const msg = data.error ?? "Toplu işlem başarısız.";
      setError(msg);
      toast.error("Toplu işlem başarısız", msg);
      return;
    }
    const failed = data.failed ?? [];
    if (failed.length > 0) {
      const msg = `${data.succeeded ?? 0}/${data.total ?? 0} başarılı, ${failed.length} sipariş atlandı (${failed[0]?.error}…).`;
      setInfo(msg);
      setResultPopup({ tone: "default", message: msg });
    } else {
      const msg = `${data.succeeded ?? 0} sipariş güncellendi.`;
      setInfo(msg);
      setResultPopup({ tone: "success", message: msg });
    }
    // Sayfa yenilemesi sonuç pop-up'ı kapatılınca yapılır (refresh'in pop-up
    // altında çalışıp "ekran donuyor" hissi vermemesi için).
    setShowModal(false);
    setSelected(new Set());
  }

  async function runDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res =
        deleteTarget.kind === "single"
          ? await fetch(`/api/admin/orders/${deleteTarget.id}`, {
              method: "DELETE",
            })
          : await fetch("/api/admin/orders/bulk-delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderIds: deleteTarget.ids }),
            });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        succeeded?: number;
        failed?: { id: string; error: string }[];
      };
      if (!res.ok) {
        const msg = data.error ?? "Silme başarısız.";
        setError(msg);
        toast.error("Silme başarısız", msg);
        setDeleting(false);
        setDeleteTarget(null);
        return;
      }
      const count = deleteTarget.kind === "single" ? 1 : data.succeeded ?? 0;
      const skipped = data.failed?.length ?? 0;
      toast.success(
        "Silindi",
        `${count} sipariş kalıcı olarak silindi${
          skipped > 0 ? `, ${skipped} atlandı` : ""
        }.`
      );
      setSelected(new Set());
      setDeleteTarget(null);
      setDeleting(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Silme başarısız.");
      toast.error("Silme başarısız", "Beklenmedik bir hata oluştu.");
      setDeleting(false);
    }
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
                  {o.dealerCompanyName || o.customerName}
                  {o.schoolName ? ` · ${o.schoolName}` : ""}
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
              <span className="text-gray-400">· {o.itemCount} ürün</span>
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
            Sipariş bulunamadi.
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
                      aria-label="Tümunu seç"
                      className="h-4 w-4 cursor-pointer"
                    />
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Sipariş No
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Musteri
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Okul
                  </th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">
                    Ürün
                  </th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                    Ödeme
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
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                    İşlem
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
                        aria-label={`${o.orderNumber} seç`}
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
                          {o.dealerCompanyName || o.customerName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {o.dealerCompanyName
                            ? o.customerName
                            : o.customerEmail}
                        </p>
                      </div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {o.schoolName || "—"}
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
                    <td className="p-3 text-right">
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            kind: "single",
                            id: o.id,
                            label: o.orderNumber,
                          })
                        }
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        Sil
                      </button>
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
                {selected.size} sipariş secildi
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setDeleteTarget({ kind: "bulk", ids: [...selected] })
                }
                disabled={pending}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                Kalıcı Sil
              </button>
              <button
                onClick={() => setShowModal(true)}
                disabled={pending}
                className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
              >
                Toplu Durum / Kargo
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <OrdersBulkStatusModal
          count={selected.size}
          selectedStatuses={selectedStatuses}
          onClose={() => setShowModal(false)}
          onApply={applyPatch}
          pending={pending}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Siparişi kalıcı sil"
        tone="danger"
        busy={deleting}
        confirmLabel="Kalıcı Sil"
        cancelLabel="Vazgeç"
        message={
          deleteTarget?.kind === "single"
            ? `"${deleteTarget.label}" siparişi ve tüm bağlı kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : `Seçili ${
                deleteTarget?.kind === "bulk" ? deleteTarget.ids.length : 0
              } sipariş kalıcı olarak silinecek. Bu işlem geri alınamaz.`
        }
        onConfirm={runDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={resultPopup !== null}
        title={resultPopup?.tone === "success" ? "İşlem tamamlandı" : "Kısmen tamamlandı"}
        tone={resultPopup?.tone === "success" ? "success" : "default"}
        message={resultPopup?.message}
        confirmLabel="Tamam"
        onConfirm={() => {
          setResultPopup(null);
          startTransition(() => router.refresh());
        }}
      />
    </>
  );
}
