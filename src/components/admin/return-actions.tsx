"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/stores/toast-store";

export function ReturnActions({ returnId }: { returnId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  async function process(action: "APPROVE" | "REJECT") {
    setBusy(true);
    const res = await fetch(`/api/admin/returns/${returnId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote: note || undefined }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      toast.error("İşlem başarısız", data.error ?? undefined);
      return;
    }
    toast.success(
      action === "APPROVE" ? "İade onaylandı" : "İade reddedildi",
      action === "APPROVE" ? "Stok ve cari güncellendi." : undefined
    );
    setRejecting(false);
    setNote("");
    startTransition(() => router.refresh());
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Red sebebi (opsiyonel)"
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm min-w-[200px]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => process("REJECT")}
            disabled={busy || pending}
            className="px-3 py-1.5 text-sm font-semibold text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
          >
            Reddet
          </button>
          <button
            onClick={() => setRejecting(false)}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-brand-black cursor-pointer"
          >
            Vazgeç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => process("APPROVE")}
        disabled={busy || pending}
        className="px-3 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
      >
        Onayla
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={busy || pending}
        className="px-3 py-1.5 text-sm font-semibold text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
      >
        Reddet
      </button>
    </div>
  );
}
