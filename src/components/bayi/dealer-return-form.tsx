"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { useErrorScroll } from "@/lib/hooks/use-error-scroll";

interface OrderItemOpt {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
}
interface OrderOpt {
  id: string;
  orderNumber: string;
  items: OrderItemOpt[];
}

export function DealerReturnForm({ orders }: { orders: OrderOpt[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useErrorScroll(error);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === orderId) ?? null,
    [orders, orderId]
  );

  const total = useMemo(() => {
    if (!selectedOrder) return 0;
    return selectedOrder.items.reduce((sum, it) => {
      const q = Number(qty[it.id] ?? "0");
      return sum + (Number.isFinite(q) && q > 0 ? q * it.unitPrice : 0);
    }, 0);
  }, [selectedOrder, qty]);

  function reset() {
    setOrderId("");
    setQty({});
    setReason("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!selectedOrder) {
      setError("Lütfen bir sipariş seçin.");
      return;
    }
    const items = selectedOrder.items
      .map((it) => ({ orderItemId: it.id, quantity: Number(qty[it.id] ?? "0") }))
      .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
    if (items.length === 0) {
      setError("İade edilecek en az bir ürün adedi girin.");
      return;
    }
    // Adet sipariş adedini aşmasın (sunucu da kontrol eder).
    for (const it of items) {
      const src = selectedOrder.items.find((s) => s.id === it.orderItemId)!;
      if (it.quantity > src.quantity) {
        setError(`"${src.productName}" için iade adedi sipariş adedini (${src.quantity}) aşamaz.`);
        return;
      }
    }

    setBusy(true);
    const res = await fetch("/api/dealer/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, reason: reason || undefined, items }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      returnNumber?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      const msg = data.error ?? "İade talebi oluşturulamadı.";
      setError(msg);
      toast.error("İade talebi başarısız", msg);
      return;
    }
    toast.success("İade talebi oluşturuldu", `${data.returnNumber} — onay bekliyor.`);
    reset();
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-brand-black">Yeni İade Talebi</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Teslim aldığınız bir siparişten ürün iadesi talep edin.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={orders.length === 0}
          className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {orders.length === 0 ? "İade edilebilir sipariş yok" : "İade Oluştur"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-black">Yeni İade Talebi</h2>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-sm text-gray-500 hover:text-brand-black cursor-pointer"
        >
          Kapat
        </button>
      </div>

      {error && (
        <div ref={errorRef} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">Sipariş</span>
        <select
          value={orderId}
          onChange={(e) => {
            setOrderId(e.target.value);
            setQty({});
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">-- Sipariş seçin --</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber}
            </option>
          ))}
        </select>
      </label>

      {selectedOrder && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500">İade edilecek adetleri girin</p>
          {selectedOrder.items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-brand-black truncate">{it.productName}</p>
                <p className="text-[11px] text-gray-500 font-mono">
                  {it.productSku} · {formatPrice(it.unitPrice)} · sipariş: {it.quantity}
                </p>
              </div>
              <input
                type="number"
                min={0}
                max={it.quantity}
                value={qty[it.id] ?? ""}
                onChange={(e) =>
                  setQty((prev) => ({ ...prev, [it.id]: e.target.value }))
                }
                placeholder="0"
                className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right"
              />
            </div>
          ))}
        </div>
      )}

      <label className="block">
        <span className="block text-xs font-medium text-gray-500 mb-1">
          İade Sebebi (opsiyonel)
        </span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Örn. hasarlı ürün, yanlış gönderim..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
      </label>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="text-sm text-gray-600">
          Toplam: <strong className="text-brand-black">{formatPrice(total)}</strong>
        </span>
        <button
          onClick={submit}
          disabled={busy || pending || !selectedOrder}
          className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {busy ? "Gönderiliyor..." : "İade Talebi Gönder"}
        </button>
      </div>
    </div>
  );
}
