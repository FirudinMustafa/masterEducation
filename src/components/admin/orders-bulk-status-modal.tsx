"use client";

import { useState } from "react";
import type { OrderStatus, CargoCarrier } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { ConfirmDialog } from "./confirm-dialog";

export type BulkPatch = {
  status?: OrderStatus;
  trackingCarrier?: CargoCarrier | null;
  trackingCarrierName?: string | null;
  estimatedDeliveryAt?: string | null;
  adminNote?: string;
};

const STATUS_OPTIONS: OrderStatus[] = [
  "APPROVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

const CARRIER_OPTIONS: CargoCarrier[] = [
  "ARAS",
  "YURTICI",
  "MNG",
  "PTT",
  "SURAT",
  "KOLAY_GELSIN",
  "HEPSIJET",
  "TRENDYOL",
  "DEPODAN_TESLIM",
  "OTHER",
];

const CARRIER_LABELS: Record<CargoCarrier, string> = {
  ARAS: "Aras Kargo",
  YURTICI: "Yurtiçi Kargo",
  MNG: "MNG Kargo",
  PTT: "PTT Kargo",
  SURAT: "Sürat Kargo",
  KOLAY_GELSIN: "Kolay Gelsin",
  HEPSIJET: "HepsiJet",
  TRENDYOL: "Trendyol Express",
  DEPODAN_TESLIM: "Depodan Teslim",
  OTHER: "Diğer",
};

interface Props {
  count: number;
  onClose: () => void;
  onApply: (patch: BulkPatch) => Promise<void> | void;
  pending: boolean;
}

export function OrdersBulkStatusModal({ count, onClose, onApply, pending }: Props) {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [carrier, setCarrier] = useState<CargoCarrier | "">("");
  const [carrierName, setCarrierName] = useState("");
  const [eta, setEta] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function buildPatch(): BulkPatch | null {
    const patch: BulkPatch = {};
    if (status) patch.status = status;
    if (carrier) patch.trackingCarrier = carrier;
    if (carrierName.trim()) patch.trackingCarrierName = carrierName.trim();
    if (eta) patch.estimatedDeliveryAt = new Date(eta).toISOString();
    if (adminNote.trim()) patch.adminNote = adminNote.trim();
    if (Object.keys(patch).length === 0) return null;
    return patch;
  }

  const isShipping = status === "SHIPPED";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-display font-bold text-brand-black">
            Toplu Durum / Kargo Güncelle
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            <strong>{count}</strong> siparişe aynı değerler uygulanır. Boş alanlar
            atlanır.
          </p>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Yeni Durum
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            <option value="">— Değişiklik yok —</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s] || s}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Kargo Firması
            </span>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value as CargoCarrier | "")}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">— Değişiklik yok —</option>
              {CARRIER_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CARRIER_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Tahmini Teslim
            </span>
            <input
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
        </div>

        {carrier === "OTHER" && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Kargo Firma Adı (Diğer)
            </span>
            <input
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              placeholder="orn. Geliyo Kargo"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Admin Notu (her sipariş için aynı not)
          </span>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={2}
            placeholder="opsiyonel — timeline'da gözükür"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </label>

        {isShipping && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Tracking numarası bulk işlemde otomatik üretilir veya boş kalır —
            sonradan tek tek doldurabilirsiniz.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending || !buildPatch()}
            className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            Uygula
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Toplu güncelleme?"
        tone={status === "CANCELLED" ? "danger" : "default"}
        message={
          <>
            <strong>{count}</strong> siparişe seçili değerler uygulanacak
            {status ? (
              <>
                {" "}(yeni durum: <strong>{ORDER_STATUS_LABELS[status] || status}</strong>)
              </>
            ) : null}
            . Onaylıyor musunuz?
          </>
        }
        confirmLabel="Evet, uygula"
        busy={pending}
        onConfirm={async () => {
          const patch = buildPatch();
          if (!patch) return;
          await onApply(patch);
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
