"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CargoCarrier, OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { CARGO_CARRIERS } from "@/lib/cargo-carriers";
import { useBusy } from "@/lib/hooks/use-busy";
import { toast } from "@/stores/toast-store";
import { ConfirmDialog } from "./confirm-dialog";

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
// Admin yanlış geçiş secip 400 almasin diye dropdown sadece izinli sonraki
// state'leri + mevcut state'i (no-op tracking/note güncelleme icin) gösterir.
const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  // Yanlışlıkla iptal edilen sipariş PENDING'e geri alınabilir (reaktivasyon).
  CANCELLED: ["PENDING"],
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
  "DEPODAN_TESLIM",
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
  const { busy, run } = useBusy();
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<OrderStatus>(status);
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [carrier, setCarrier] = useState<CargoCarrier | "">(
    trackingCarrier ?? "",
  );
  const [carrierName, setCarrierName] = useState(trackingCarrierName ?? "");
  const [eta, setEta] = useState(toDateInput(estimatedDeliveryAt));
  const [note, setNote] = useState(adminNote ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  // Depodan teslimde harici kargo takibi yoktur — takip no alanı gizlenir
  // ve gönderimde boş geçilir.
  const isWarehouse = carrier === "DEPODAN_TESLIM";
  const isReactivating = status === "CANCELLED" && newStatus === "PENDING";

  function submit() {
    return run(async () => {
      setError(null);
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          trackingNumber: isWarehouse ? undefined : tracking || undefined,
          trackingCarrier: carrier || null,
          trackingCarrierName: carrier === "OTHER" ? carrierName || "" : "",
          estimatedDeliveryAt: eta || null,
          adminNote: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error ?? "Güncelleme başarısız.";
        setError(msg);
        setConfirmOpen(false);
        toast.error("Güncelleme başarısız", msg);
        return;
      }
      // Önce başarı pop-up'ı net gözüksün; sayfa yenilemesi (router.refresh)
      // kullanıcı "Tamam"a basınca yapılır — aksi halde refresh pop-up'ın
      // altında çalışıp "ekran donuyor" hissi veriyor.
      setConfirmOpen(false);
      setSuccessOpen(true);
    });
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
            Teslim edilmiş — final durum.
          </span>
        )}
        {status === "CANCELLED" && (
          <span className="mt-1 block text-[11px] text-amber-600">
            İptal edilmiş — durumu Onay Bekliyor yapıp geri alabilirsiniz (stok
            ve kredi tersine çevrilir).
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

        {!isWarehouse && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Kargo Takip No</span>
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold font-mono"
            />
          </label>
        )}
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
          placeholder="Musteriye görünen açıklama (timeline'da yer alir)"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-gold"
        />
      </label>

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
      >
        Güncelle
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title={isReactivating ? "Siparişi geri al?" : "Durumu güncelle?"}
        tone={newStatus === "CANCELLED" ? "danger" : "default"}
        message={
          isReactivating ? (
            <>
              Bu sipariş <strong>İptal Edildi</strong> durumundan{" "}
              <strong>Onay Bekliyor</strong> durumuna geri alınacak. Stok tekrar
              düşülecek ve açık hesapta kredi yeniden borçlandırılacak.
            </>
          ) : (
            <>
              Sipariş durumu{" "}
              <strong>{ORDER_STATUS_LABELS[newStatus]}</strong> olarak
              güncellenecek. Onaylıyor musunuz?
            </>
          )
        }
        confirmLabel={newStatus === "CANCELLED" ? "Evet, iptal et" : "Evet, güncelle"}
        busy={busy}
        onConfirm={submit}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={successOpen}
        title="Sipariş güncellendi"
        tone="success"
        message={<>Durum: <strong>{ORDER_STATUS_LABELS[newStatus]}</strong></>}
        confirmLabel="Tamam"
        onConfirm={() => {
          setSuccessOpen(false);
          router.refresh();
        }}
      />
    </div>
  );
}
