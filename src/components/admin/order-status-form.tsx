"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CargoCarrier, OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { CARGO_CARRIERS } from "@/lib/cargo-carriers";

interface OrderStatusFormProps {
  orderId: string;
  status: OrderStatus;
  trackingNumber: string | null;
  trackingCarrier: CargoCarrier | null;
  trackingCarrierName: string | null;
  estimatedDeliveryAt: Date | string | null;
  adminNote: string | null;
}

// Backend whitelist'i ile birebir aynı (orders/[id]/status + bulk-status).
// Admin yanlış geçiş seçip 400 almasin diye dropdown sadece izinli sonraki
// state'leri + mevcut state'i (no-op tracking/note guncelleme icin) gösterir.
const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const CARRIER_KEYS: CargoCarrier[] = [
  "ARAS",
  "YURTICI",
  "MNG",
  "PTT",
  "SURAT",
  "KOLAY_GELSIN",
  "HEPSIJET",
  "TRENDYOL",
  "OTHER",
];

function toDateInput(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function OrderStatusForm({
  orderId,
  status,
  trackingNumber,
  trackingCarrier,
  trackingCarrierName,
  estimatedDeliveryAt,
  adminNote,
}: OrderStatusFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>(status);
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [carrier, setCarrier] = useState<CargoCarrier | "">(
    trackingCarrier ?? "",
  );
  const [carrierName, setCarrierName] = useState(trackingCarrierName ?? "");
  const [eta, setEta] = useState(toDateInput(estimatedDeliveryAt));
  const [note, setNote] = useState(adminNote ?? "");

  async function submit() {
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        trackingNumber: tracking || undefined,
        trackingCarrier: carrier || null,
        trackingCarrierName: carrier === "OTHER" ? carrierName || "" : "",
        estimatedDeliveryAt: eta || null,
        adminNote: note || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Guncelleme basarisiz.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Durum</span>
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
          disabled={ALLOWED_NEXT[status].length === 0}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
        >
          {/* Mevcut state — no-op (sadece tracking/note güncelleme) */}
          <option value={status}>{ORDER_STATUS_LABELS[status]}</option>
          {ALLOWED_NEXT[status].map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {ALLOWED_NEXT[status].length === 0 && (
          <span className="mt-1 block text-[11px] text-gray-400">
            {status === "DELIVERED"
              ? "Teslim edilmiş — final durum."
              : "İptal edilmiş — yeni siparişle devam edin."}
          </span>
        )}
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Kargo Firmasi</span>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value as CargoCarrier | "")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold bg-white"
          >
            <option value="">— Secilmedi —</option>
            {CARRIER_KEYS.map((key) => (
              <option key={key} value={key}>
                {CARGO_CARRIERS[key].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">Kargo Takip No</span>
          <input
            type="text"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold font-mono"
          />
        </label>
      </div>

      {carrier === "OTHER" && (
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Kargo Firmasi Adi (serbest)
          </span>
          <input
            type="text"
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            placeholder="Orn: Jetkargo"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
          />
        </label>
      )}

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">
          Tahmini Teslim Tarihi
        </span>
        <input
          type="date"
          value={eta}
          onChange={(e) => setEta(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Admin Notu</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Musteriye gorunen aciklama (timeline'da yer alir)"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
        />
      </label>

      <button
        onClick={submit}
        disabled={pending}
        className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
      >
        Guncelle
      </button>
    </div>
  );
}
