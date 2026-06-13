"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { ProductsBulkUpdateModal, type Patch } from "./products-bulk-update-modal";

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  publisherName: string | null;
  categoryName: string | null;
  price: number;
  stockQuantity: number;
  isPublished: boolean;
}

interface Category {
  id: string;
  name: string;
  type: string;
}

interface Publisher {
  id: string;
  name: string;
}

interface Props {
  products: ProductRow[];
  categories: Category[];
  publishers: Publisher[];
}

export function ProductsTable({ products, categories, publishers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const allChecked = useMemo(
    () => products.length > 0 && products.every((p) => selected.has(p.id)),
    [products, selected]
  );

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const next = new Set(prev);
      for (const p of products) next.add(p.id);
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function applyPatch(patch: Patch) {
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/products/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [...selected], patch }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      updated?: number;
    };
    if (!res.ok) {
      setError(data.error ?? "Toplu güncelleme başarısız.");
      toast.error("Toplu güncelleme başarısız", data.error ?? undefined);
      return;
    }
    const updated = data.updated ?? 0;
    setInfo(`${updated} ürün güncellendi.`);
    toast.success("Toplu güncelleme tamamlandı", `${updated} ürün güncellendi.`);
    setShowModal(false);
    clearSelection();
    startTransition(() => router.refresh());
  }

  async function bulkSetPublished(isPublished: boolean) {
    if (
      !confirm(
        `${selected.size} ürün ${isPublished ? "yayina alinsin" : "yayindan kaldirilsin"} mi?`
      )
    )
      return;
    await applyPatch({ isPublished });
  }

  async function bulkDelete() {
    if (
      !confirm(
        `${selected.size} ürün silinsin mi?\n\nSiparise konu olmus ürünler "yayin disi" yapilir, digerleri tamamen silinir.`
      )
    )
      return;
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/products/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [...selected] }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      hardDeleted?: number;
      softDeleted?: number;
    };
    if (!res.ok) {
      setError(data.error ?? "Silme başarısız.");
      toast.error("Silme başarısız", data.error ?? undefined);
      return;
    }
    const msg = `${data.hardDeleted ?? 0} ürün silindi, ${data.softDeleted ?? 0} ürün yayin disi yapildi.`;
    setInfo(msg);
    toast.success("Silme tamamlandı", msg);
    clearSelection();
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

      {/* Mobile: kart listesi (multi-select desteksiz; mobilde admin az kullanim) */}
      <div className="space-y-3 md:hidden">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/admin/urunler/${product.id}`}
            className="block rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="line-clamp-2 flex-1 text-sm font-medium text-brand-black">
                {product.name}
              </p>
              <span
                className={`shrink-0 inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full ${
                  product.isPublished
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {product.isPublished ? "Aktif" : "Pasif"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-mono text-gray-500">{product.sku}</span>
              {product.publisherName && (
                <span className="text-gray-500">{product.publisherName}</span>
              )}
              <span className="ml-auto font-semibold text-brand-black">
                {formatPrice(product.price)}
              </span>
              <span
                className={
                  product.stockQuantity > 0 ? "text-green-600" : "text-red-600"
                }
              >
                Stok: {product.stockQuantity}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop: tablo */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  Ürün
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  ISBN
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  Yayınevi
                </th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">
                  Kategori
                </th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                  Fiyat
                </th>
                <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">
                  Stok
                </th>
                <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">
                  Durum
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 ${
                    selected.has(product.id) ? "bg-brand-gold-light/10" : ""
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleOne(product.id)}
                      aria-label={`${product.name} seç`}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/admin/urunler/${product.id}`}
                      className="font-medium text-brand-black hover:text-brand-gold-dark line-clamp-1 max-w-xs block"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="p-3 text-gray-500 font-mono text-xs">
                    {product.sku}
                  </td>
                  <td className="p-3 text-gray-600">
                    {product.publisherName || "-"}
                  </td>
                  <td className="p-3 text-gray-600">
                    {product.categoryName || "-"}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {formatPrice(product.price)}
                  </td>
                  <td className="p-3 text-right">
                    <span
                      className={
                        product.stockQuantity > 0
                          ? "text-green-600"
                          : "text-red-600"
                      }
                    >
                      {product.stockQuantity}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        product.isPublished
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {product.isPublished ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky aksiyon bari */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-brand-black">
                {selected.size} ürün secildi
              </span>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowModal(true)}
                disabled={pending}
                className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
              >
                Toplu Güncelle
              </button>
              <button
                onClick={() => bulkSetPublished(true)}
                disabled={pending}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Yayina Al
              </button>
              <button
                onClick={() => bulkSetPublished(false)}
                disabled={pending}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Yayindan Kaldir
              </button>
              <button
                onClick={bulkDelete}
                disabled={pending}
                className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 cursor-pointer"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <ProductsBulkUpdateModal
          count={selected.size}
          categories={categories}
          publishers={publishers}
          onClose={() => setShowModal(false)}
          onApply={applyPatch}
          pending={pending}
        />
      )}
    </>
  );
}
