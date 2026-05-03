"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  ChevronDownIcon,
  DocumentTextIcon,
  TruckIcon,
  TagIcon,
  ClockIcon,
} from "@/components/ui/icons";

export interface OrderItem {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
  discountPct: number;
}

export interface OrderCardData {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  couponDiscount: number;
  vatTotal: number;
  shippingCost: number;
  total: number;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPhone: string;
  createdAt: Date | string;
  shippedAt: Date | string | null;
  deliveredAt: Date | string | null;
  estimatedDeliveryAt: Date | string | null;
  items: OrderItem[];
  note: string | null;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  APPROVED: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  PROCESSING: "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200",
  SHIPPED: "bg-purple-100 text-purple-700 ring-1 ring-purple-200",
  DELIVERED: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  CANCELLED: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
};

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function OrderCard({ order }: { order: OrderCardData }) {
  const [expanded, setExpanded] = useState(false);

  const visibleItems = expanded ? order.items : order.items.slice(0, 2);
  const hiddenCount = order.items.length - visibleItems.length;
  const netTotal = order.subtotal - order.discountTotal - order.couponDiscount + order.shippingCost;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* HEADER — sipariş no + tarih + status + tutar */}
      <div className="border-b border-neutral-100 bg-neutral-50/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums",
                  STATUS_TONE[order.status] ?? "bg-gray-100 text-gray-700"
                )}
              >
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
              <span className="truncate text-[11px] font-mono text-neutral-500">
                {order.orderNumber}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <ClockIcon className="h-3.5 w-3.5" />
                {fmtDate(order.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <TagIcon className="h-3.5 w-3.5" />
                {order.items.length} urun
              </span>
            </div>
          </div>

          {/* Tutar — sağda, sabit genişlik tabular-nums sığ */}
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Toplam
            </p>
            <p className="font-display text-xl font-bold tabular-nums text-neutral-950">
              {formatPrice(order.total)}
            </p>
          </div>
        </div>
      </div>

      {/* BODY — ürün listesi (kompakt) */}
      <div className="p-4 sm:p-5">
        <ul className="space-y-2.5">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 text-[13px]"
            >
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 shrink-0 items-center justify-center rounded-md bg-neutral-100 px-1.5 text-[11px] font-bold tabular-nums text-neutral-600">
                  {item.quantity}×
                </span>
                <span className="min-w-0 break-words text-neutral-800">
                  {item.productName}
                </span>
              </div>
              <span className="shrink-0 font-medium tabular-nums text-neutral-900">
                {formatPrice(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        {hiddenCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-3 w-full rounded-lg bg-neutral-50 px-3 py-2 text-center text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer"
          >
            + {hiddenCount} urun daha
          </button>
        )}

        {/* Tracking */}
        {order.trackingNumber && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px]">
            <div className="flex items-center gap-1.5">
              <TruckIcon className="h-4 w-4 text-neutral-500" />
              <span className="text-neutral-500">Kargo Takip:</span>
              <span className="truncate font-mono font-semibold text-neutral-900">
                {order.trackingNumber}
              </span>
            </div>
            <Link
              href={`/kargo-takip/${order.trackingNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-semibold text-brand-gold-dark hover:underline"
            >
              Takip et →
            </Link>
          </div>
        )}
      </div>

      {/* EXPANDED — adres + KDV + kupon + zaman çizelgesi */}
      {expanded && (
        <div className="space-y-4 border-t border-neutral-100 bg-neutral-50/40 p-4 sm:p-5">
          {/* Detay grid: adres + ödeme */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DetailBlock label="Teslimat Adresi">
              <p className="font-medium text-neutral-900">{order.shippingName}</p>
              <p className="mt-0.5 break-words text-neutral-600">{order.shippingAddress}</p>
              <p className="text-neutral-600">{order.shippingCity}</p>
              <p className="mt-0.5 font-mono text-[11px] text-neutral-500">
                {order.shippingPhone}
              </p>
            </DetailBlock>
            <DetailBlock label="Odeme">
              <p className="font-medium text-neutral-900">
                {order.paymentMethod === "OPEN_ACCOUNT" ? "Acik Hesap" : "Kredi Karti"}
              </p>
              <p className="mt-0.5 text-neutral-600">
                Durum:{" "}
                <span
                  className={cn(
                    order.paymentStatus === "PAID" && "text-emerald-700 font-semibold",
                    order.paymentStatus === "FAILED" && "text-rose-700 font-semibold",
                    order.paymentStatus === "REFUNDED" && "text-neutral-700 font-semibold"
                  )}
                >
                  {order.paymentStatus === "PAID"
                    ? "Odendi"
                    : order.paymentStatus === "PENDING"
                      ? "Bekliyor"
                      : order.paymentStatus === "FAILED"
                        ? "Basarisiz"
                        : order.paymentStatus === "REFUNDED"
                          ? "Iade Edildi"
                          : order.paymentStatus}
                </span>
              </p>
              {order.couponCode && (
                <p className="mt-0.5 text-neutral-600">
                  Kupon:{" "}
                  <span className="font-mono font-semibold text-neutral-900">
                    {order.couponCode}
                  </span>
                </p>
              )}
            </DetailBlock>
          </div>

          {/* Tutar dağılımı */}
          <DetailBlock label="Tutar Detayi">
            <table className="w-full text-[13px]">
              <tbody>
                <BreakdownRow label="Ara Toplam" value={order.subtotal} />
                {order.discountTotal > 0 && (
                  <BreakdownRow
                    label="Bayi/Urun Iskontosu"
                    value={-order.discountTotal}
                    accent="emerald"
                  />
                )}
                {order.couponDiscount > 0 && (
                  <BreakdownRow
                    label={`Kupon (${order.couponCode ?? ""})`}
                    value={-order.couponDiscount}
                    accent="emerald"
                  />
                )}
                {order.vatTotal > 0 && (
                  <BreakdownRow
                    label="KDV (dahil)"
                    value={order.vatTotal}
                    muted
                  />
                )}
                <BreakdownRow
                  label="Kargo"
                  value={order.shippingCost}
                  muted={order.shippingCost === 0}
                  free={order.shippingCost === 0}
                />
                <tr>
                  <td
                    colSpan={2}
                    className="pt-2"
                  >
                    <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Toplam
                      </span>
                      <span className="font-display text-lg font-bold tabular-nums text-neutral-950">
                        {formatPrice(netTotal)}
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </DetailBlock>

          {/* Zaman çizelgesi */}
          <DetailBlock label="Zaman Cizelgesi">
            <ol className="space-y-2 text-[12px]">
              <TimelineRow
                label="Olusturuldu"
                date={order.createdAt}
                active
              />
              {order.shippedAt && (
                <TimelineRow label="Kargoya verildi" date={order.shippedAt} active />
              )}
              {order.deliveredAt ? (
                <TimelineRow label="Teslim edildi" date={order.deliveredAt} active />
              ) : order.estimatedDeliveryAt ? (
                <TimelineRow
                  label="Tahmini teslim"
                  date={order.estimatedDeliveryAt}
                  active={false}
                />
              ) : null}
            </ol>
          </DetailBlock>

          {order.note && (
            <DetailBlock label="Sipariş Notunuz">
              <p className="whitespace-pre-wrap text-[13px] text-neutral-700">{order.note}</p>
            </DetailBlock>
          )}
        </div>
      )}

      {/* FOOTER — toggle + fatura/PDF */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-white px-4 py-2.5 sm:px-5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer"
        >
          {expanded ? "Detayi Gizle" : "Detayi Goster"}
          <ChevronDownIcon
            className={cn(
              "h-4 w-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        <a
          href={`/api/orders/${order.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 cursor-pointer"
        >
          <DocumentTextIcon className="h-4 w-4" />
          PDF olarak indir
        </a>
      </div>
    </div>
  );
}

// ─── Internal helpers ─────────────────────────────────────────────

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3.5 sm:p-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <div className="text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  accent,
  muted,
  free,
}: {
  label: string;
  value: number;
  accent?: "emerald";
  muted?: boolean;
  free?: boolean;
}) {
  return (
    <tr>
      <td className={cn("py-1", muted ? "text-neutral-500" : "text-neutral-700")}>
        {label}
      </td>
      <td
        className={cn(
          "py-1 text-right tabular-nums",
          accent === "emerald" && "text-emerald-700 font-semibold",
          free && "text-emerald-700 font-semibold",
          !accent && !free && "text-neutral-900 font-medium"
        )}
      >
        {free ? "Ucretsiz" : value < 0 ? `-${formatPrice(Math.abs(value))}` : formatPrice(value)}
      </td>
    </tr>
  );
}

function TimelineRow({
  label,
  date,
  active,
}: {
  label: string;
  date: Date | string;
  active: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            active ? "bg-emerald-500" : "bg-neutral-300"
          )}
        />
        <span className={cn(active ? "text-neutral-800" : "text-neutral-500")}>
          {label}
        </span>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-neutral-500">
        {fmtDate(date)}
      </span>
    </li>
  );
}
