"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { productImageUrl } from "@/lib/images";

interface ProductImageItem {
  id: string;
  filename: string;
  displayOrder: number;
}

interface ProductImagesManagerProps {
  productId: string;
  images: ProductImageItem[];
}

export function ProductImagesManager({
  productId,
  images: initialImages,
}: ProductImagesManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [images, setImages] = useState(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/products/${productId}/images`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      filename?: string;
      displayOrder?: number;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Yukleme basarisiz.");
      return;
    }
    if (data.id && data.filename && typeof data.displayOrder === "number") {
      setImages((prev) => [
        ...prev,
        { id: data.id!, filename: data.filename!, displayOrder: data.displayOrder! },
      ]);
      startTransition(() => router.refresh());
    }
  }

  async function remove(imageId: string) {
    if (!confirm("Bu gorsel silinsin mi?")) return;
    const res = await fetch(
      `/api/admin/products/${productId}/images/${imageId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Silinemedi.");
      return;
    }
    setImages((prev) => prev.filter((i) => i.id !== imageId));
    startTransition(() => router.refresh());
  }

  async function move(imageId: string, direction: -1 | 1) {
    const idx = images.findIndex((i) => i.id === imageId);
    if (idx < 0) return;
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= images.length) return;
    const reordered = [...images];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setImages(reordered);
    const res = await fetch(
      `/api/admin/products/${productId}/images/reorder`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: reordered.map((i) => i.id) }),
      }
    );
    if (!res.ok) {
      setImages(images); // rollback
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Siralama kaydedilemedi.");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-brand-black">Gorseller</h2>
        <label className="px-3 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark cursor-pointer">
          {uploading ? "Yukleniyor..." : "Gorsel Ekle"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={uploading || pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
        </label>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {images.length === 0 ? (
        <p className="text-sm text-gray-500">Henuz gorsel yok.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((img, i) => (
            <li
              key={img.id}
              className="relative group border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productImageUrl(img.filename)}
                alt=""
                className="w-full h-32 object-contain bg-gray-50"
              />
              <div className="absolute inset-x-0 bottom-0 flex justify-between items-center bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(img.id, -1)}
                    disabled={i === 0}
                    className="disabled:opacity-30 cursor-pointer"
                    aria-label="Yukari"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(img.id, 1)}
                    disabled={i === images.length - 1}
                    className="disabled:opacity-30 cursor-pointer"
                    aria-label="Asagi"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  className="text-red-300 hover:text-red-100 cursor-pointer"
                  aria-label="Sil"
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
