"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductImageStaging } from "./product-image-staging";
import { PRODUCT_LANGUAGES } from "@/lib/constants";
import { useErrorScroll } from "@/lib/hooks/use-error-scroll";

interface Option {
  id: string;
  name: string;
}

export interface ProductFormValues {
  name: string;
  sku: string;
  price: string;
  oldPrice: string;
  vatRate: string;
  stockQuantity: string;
  publisherId: string;
  categoryId: string;
  description: string;
  language: string;
  productType: string;
  discountGroup: string;
  authorCode: string;
  isPublished: boolean;
}

interface ProductFormProps {
  mode: "create" | "edit";
  productId?: string;
  initial: ProductFormValues;
  publishers: Option[];
  categories: Option[];
}

function toNumber(v: string, fallback: number | null = null): number | null {
  const t = v.trim();
  if (t === "") return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}

export function ProductForm({
  mode,
  productId,
  initial,
  publishers,
  categories,
}: ProductFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<ProductFormValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const errorRef = useErrorScroll(error);

  function update<K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const price = toNumber(form.price);
    if (price === null || price < 0) {
      setError("Fiyat gecerli bir sayı olmalidir.");
      return;
    }
    const stock = toNumber(form.stockQuantity);
    if (stock === null || stock < 0 || !Number.isInteger(stock)) {
      setError("Stok negatif olmayan bir tam sayı olmalidir.");
      return;
    }
    const vat = toNumber(form.vatRate);
    if (vat === null || vat < 0 || vat > 100) {
      setError("KDV oranı 0–100 arası bir sayı olmalidir.");
      return;
    }

    // Yeni ürün eklerken Yayınevi + Kategori zorunlu (doğru sınıflandırma için).
    // Düzenlemede zorunlu tutulmaz — eski ürünlerde bu alanlar boş olabilir ve
    // kullanıcı yalnızca fiyat/stok güncellemek isteyebilir.
    if (mode === "create") {
      const requiredFields: Array<[string, string]> = [
        [form.publisherId, "Yayınevi"],
        [form.categoryId, "Kategori"],
      ];
      const missing = requiredFields.find(([v]) => !v);
      if (missing) {
        setError(`${missing[1]} alanı zorunludur.`);
        return;
      }
    }

    const body = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      price,
      oldPrice: toNumber(form.oldPrice),
      vatRate: vat,
      stockQuantity: stock,
      publisherId: form.publisherId || null,
      categoryId: form.categoryId || null,
      description: form.description.trim() || null,
      language: form.language.trim() || null,
      productType: form.productType.trim() || null,
      discountGroup: form.discountGroup.trim() || null,
      authorCode: form.authorCode.trim() || null,
      isPublished: form.isPublished,
    };

    const url =
      mode === "create"
        ? "/api/admin/products"
        : `/api/admin/products/${productId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      slug?: string;
      error?: string;
    };

    if (!res.ok) {
      setError(data.error ?? "Kaydedilemedi.");
      return;
    }

    setSuccess("Kaydedildi.");
    if (mode === "create" && data.id) {
      // Görsel staging — ürün oluşturulduktan sonra her görseli sırayla
      // yükle, başarısız olanları rapor et. Tek görsel başarısız olsa bile
      // ürün create succeed olmuş; kullanıcıyı edit sayfasına gönder ki
      // kalan görselleri buradan yükleyebilsin.
      if (stagedImages.length > 0) {
        let okCount = 0;
        let failCount = 0;
        let lastErr: string | null = null;
        for (let i = 0; i < stagedImages.length; i++) {
          setUploadStatus(`Görsel yükleniyor ${i + 1}/${stagedImages.length}...`);
          const fd = new FormData();
          fd.append("file", stagedImages[i]);
          const r = await fetch(`/api/admin/products/${data.id}/images`, {
            method: "POST",
            body: fd,
          });
          if (r.ok) {
            okCount++;
          } else {
            failCount++;
            const errData = (await r.json().catch(() => ({}))) as { error?: string };
            lastErr = errData.error ?? `HTTP ${r.status}`;
          }
        }
        setUploadStatus(null);
        if (failCount > 0) {
          // Gerçek sunucu hatasını göster (sadece adet değil) — "görsel
          // kaydolmuyor" şikayetinin kök nedeni görünür olsun.
          setError(
            `${okCount} görsel yüklendi, ${failCount} başarısız.${
              lastErr ? ` Hata: ${lastErr}` : ""
            }`
          );
        } else {
          setSuccess(`Ürün oluşturuldu, ${okCount} görsel yüklendi.`);
        }
      }
      startTransition(() => router.push(`/admin/urunler/${data.id}`));
    } else {
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete() {
    if (!productId) return;
    if (
      !confirm(
        "Bu ürünu silmek istediginize emin misiniz? Siparişlerde gecmis varsa pasiflestirilir."
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: "DELETE",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      mode?: "soft" | "hard";
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Silinemedi.");
      return;
    }
    if (data.mode === "soft") {
      setSuccess("Ürün pasiflestirildi (sipariş gecmisi nedeniyle).");
      startTransition(() => router.refresh());
    } else {
      startTransition(() => router.push("/admin/urunler"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div ref={errorRef} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}
      {uploadStatus && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          {uploadStatus}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-brand-black">Temel Bilgiler</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ürün Adi *" required>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="ISBN *" required>
            <input
              value={form.sku}
              onChange={(e) => update("sku", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
            />
          </Field>
          <Field label="Yazar / Kod (Opsiyonel)">
            <input
              value={form.authorCode}
              onChange={(e) => update("authorCode", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-brand-black">Fiyat ve Stok</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="İndirimli Fiyat (TL) *" required>
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="Üst Fiyat (TL)">
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.oldPrice}
              onChange={(e) => update("oldPrice", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="KDV % *" required>
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={form.vatRate}
              onChange={(e) => update("vatRate", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="Stok Adedi *" required>
            <input
              type="number"
              step="1"
              min={0}
              value={form.stockQuantity}
              onChange={(e) => update("stockQuantity", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="İskonto Grubu (Opsiyonel)">
            <input
              value={form.discountGroup}
              onChange={(e) => update("discountGroup", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-brand-black">Siniflandirma</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Yayınevi *" required>
            <select
              value={form.publisherId}
              onChange={(e) => update("publisherId", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">-- Seç --</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kategori *" required>
            <select
              value={form.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">-- Seç --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dil">
            <select
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="">-- Seç --</option>
              {PRODUCT_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ürün Tipi">
            <input
              value={form.productType}
              onChange={(e) => update("productType", e.target.value)}
              placeholder="Örneğin Ders kitabı gibi"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </Field>
        </div>
        <Field label="Ürün Açıklaması">
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={5}
            placeholder="Ürün detay sayfasında gösterilecek açıklama..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </Field>
      </div>

      {mode === "create" && (
        <ProductImageStaging
          files={stagedImages}
          onChange={setStagedImages}
          disabled={pending}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => update("isPublished", e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-medium text-brand-black">
            Ürün yayinda (magazada görünur)
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
        >
          {mode === "create" ? "Ürünu Oluştur" : "Degisiklikleri Kaydet"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
          >
            Ürünu Sil
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {required ? " " : ""}
      </span>
      {children}
    </label>
  );
}
