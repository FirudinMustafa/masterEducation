"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/stores/toast-store";
import { useErrorScroll } from "@/lib/hooks/use-error-scroll";

export interface BannerItem {
  id: string;
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  displayOrder: number;
  isActive: boolean;
}

export function BannerManager({ banners }: { banners: BannerItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorRef = useErrorScroll(error);

  async function upload() {
    setError(null);
    if (!file) {
      setError("Lütfen bir görsel seçin.");
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    if (title.trim()) fd.append("title", title.trim());
    if (linkUrl.trim()) fd.append("linkUrl", linkUrl.trim());
    const res = await fetch("/api/admin/banners", { method: "POST", body: fd });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      const msg = data.error ?? "Banner yüklenemedi.";
      setError(msg);
      toast.error("Banner yüklenemedi", msg);
      return;
    }
    toast.success("Banner eklendi");
    setFile(null);
    setTitle("");
    setLinkUrl("");
    startTransition(() => router.refresh());
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/banners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("İşlem başarısız", data.error ?? undefined);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Bu banner silinsin mi?")) return;
    const res = await fetch(`/api/admin/banners/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Silinemedi", data.error ?? undefined);
      return;
    }
    toast.success("Banner silindi");
    startTransition(() => router.refresh());
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = banners.findIndex((b) => b.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= banners.length) return;
    const a = banners[idx];
    const b = banners[swapIdx];
    // İki PATCH'i SIRALI (await) yap — yarış olmasın, displayOrder takası tutarlı
    // olsun (eski hata: iki fire-and-forget PATCH yarışıp aynı order'da kalabiliyordu).
    const r1 = await fetch(`/api/admin/banners/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayOrder: b.displayOrder }),
    });
    if (!r1.ok) {
      toast.error("Sıralama değiştirilemedi");
      return;
    }
    const r2 = await fetch(`/api/admin/banners/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayOrder: a.displayOrder }),
    });
    if (!r2.ok) {
      toast.error("Sıralama değiştirilemedi");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {error && (
        <div ref={errorRef} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-brand-black">Yeni Banner Ekle</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">Görsel (.jpg/.png/.webp)</span>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer">
                Dosya Seç
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <span className="text-sm text-gray-600 truncate max-w-[200px]">
                {file ? file.name : "Dosya seçilmedi"}
              </span>
            </div>
          </div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Başlık (opsiyonel)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Link (opsiyonel)</span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="/urunler veya https://..."
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm min-w-[200px]"
            />
          </label>
          <button
            onClick={upload}
            disabled={busy || pending || !file}
            className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
          >
            {busy ? "Yükleniyor..." : "Ekle"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {banners.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            Henüz banner yok. Yukarıdan ekleyin.
          </div>
        ) : (
          banners.map((b, i) => (
            <div
              key={b.id}
              className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-4"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.imageUrl}
                alt={b.title ?? ""}
                className="h-16 w-28 object-cover rounded-lg bg-gray-100 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-brand-black truncate">
                  {b.title || "(başlıksız)"}
                </p>
                {b.linkUrl && (
                  <p className="text-xs text-gray-500 truncate">{b.linkUrl}</p>
                )}
                <span
                  className={`mt-1 inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {b.isActive ? "Aktif" : "Pasif"}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => move(b.id, -1)}
                  disabled={i === 0 || pending}
                  className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-30 cursor-pointer"
                  aria-label="Yukarı"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(b.id, 1)}
                  disabled={i === banners.length - 1 || pending}
                  className="px-2 py-1 text-sm border border-gray-200 rounded disabled:opacity-30 cursor-pointer"
                  aria-label="Aşağı"
                >
                  ↓
                </button>
                <button
                  onClick={() => patch(b.id, { isActive: !b.isActive })}
                  className="px-3 py-1 text-sm border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                >
                  {b.isActive ? "Pasifleştir" : "Aktifleştir"}
                </button>
                <button
                  onClick={() => remove(b.id)}
                  className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 cursor-pointer"
                >
                  Sil
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
