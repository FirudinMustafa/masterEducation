"use client";

import { useEffect, useMemo } from "react";

/**
 * Yeni ürün create akışı için "staging" görsel listesi.
 * Kullanıcı dosya secer → blob preview gösterir → state'te File[] tutulur.
 * Submit edildiğinde parent (ProductForm) ürünü oluşturup ardından
 * /api/admin/products/{id}/images endpoint'ine her birini POST eder.
 *
 * Edit sayfasında bu komponent kullanılmaz; orada `ProductImagesManager`
 * doğrudan upload eder (productId hazır).
 */
export interface ProductImageStagingProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export function ProductImageStaging({ files, onChange, disabled }: ProductImageStagingProps) {
  // Preview URL'leri files'tan türet — useEffect+setState yerine useMemo
  // (React 19 önerisi: state hesaplanabiliyorsa effect kullanma).
  const previews = useMemo(
    () => files.map((f) => URL.createObjectURL(f)),
    [files]
  );

  // Memoize edilen blob URL'leri component unmount olduğunda revoke et.
  useEffect(() => {
    return () => {
      for (const u of previews) URL.revokeObjectURL(u);
    };
  }, [previews]);

  function add(picked: FileList | null) {
    if (!picked) return;
    const arr = Array.from(picked).filter((f) =>
      ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(f.type)
    );
    if (arr.length === 0) return;
    onChange([...files, ...arr]);
  }

  function remove(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-brand-black">Görseller</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Ürün oluşturulduktan sonra secilen görseller otomatik yüklenir.
          </p>
        </div>
        <label className="px-3 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark cursor-pointer">
          Görsel Seç
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            multiple
            disabled={disabled}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-gray-500">Henüz görsel secilmedi.</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="relative group border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt=""
                className="w-full h-32 object-contain bg-gray-50"
              />
              <div className="absolute inset-x-0 bottom-0 flex justify-between items-center bg-black/60 text-white text-xs px-2 py-1">
                <span className="truncate max-w-[60%]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={disabled}
                  className="text-red-300 hover:text-red-100 cursor-pointer disabled:opacity-50"
                  aria-label="Kaldır"
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
