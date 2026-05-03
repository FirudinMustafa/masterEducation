"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PreviewItem {
  filename: string;
  sku: string;
  status: "matched" | "unmatched" | "invalid_mime" | "too_large" | "magic_mismatch";
  productId?: string;
  productName?: string;
  size: number;
}

interface PreviewResp {
  counts: {
    total: number;
    matched: number;
    unmatched: number;
    invalid: number;
  };
  duplicates: string[];
  preview: PreviewItem[];
  applied: boolean;
  error?: string;
}

const STATUS_LABELS: Record<PreviewItem["status"], string> = {
  matched: "Eşleşti",
  unmatched: "ISBN bulunamadı",
  invalid_mime: "Geçersiz format",
  too_large: "5MB üstü",
  magic_mismatch: "Dosya bozuk",
};

const STATUS_COLORS: Record<PreviewItem["status"], string> = {
  matched: "bg-emerald-100 text-emerald-700",
  unmatched: "bg-amber-100 text-amber-700",
  invalid_mime: "bg-red-100 text-red-700",
  too_large: "bg-red-100 text-red-700",
  magic_mismatch: "bg-red-100 text-red-700",
};

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1024 / 1024).toFixed(1)}MB`;
}

export function BulkImageForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);

  function reset() {
    setError(null);
    setInfo(null);
    setPreview(null);
  }

  async function runPreview() {
    if (files.length === 0) return;
    reset();
    setWorking(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const res = await fetch(
      "/api/admin/products/bulk-upload-images?dryRun=1",
      { method: "POST", body: fd }
    );
    setWorking(false);
    const d = (await res.json()) as PreviewResp;
    if (!res.ok) {
      setError(d.error ?? "Preview başarısız.");
      return;
    }
    setPreview(d);
  }

  async function apply() {
    if (!preview || preview.counts.matched === 0) return;
    if (!confirm(`${preview.counts.matched} görsel yüklenecek. Devam edilsin mi?`))
      return;
    reset();
    setWorking(true);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const res = await fetch("/api/admin/products/bulk-upload-images", {
      method: "POST",
      body: fd,
    });
    setWorking(false);
    const d = (await res.json()) as {
      saved?: number;
      productsTouched?: number;
      errors?: { filename: string; error: string }[];
      error?: string;
    };
    if (!res.ok) {
      setError(d.error ?? "Yükleme başarısız.");
      return;
    }
    const errCount = d.errors?.length ?? 0;
    setInfo(
      `${d.saved ?? 0} görsel kaydedildi (${d.productsTouched ?? 0} ürüne)${errCount ? `, ${errCount} hata` : ""}.`
    );
    setPreview(null);
    setFiles([]);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {info}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h2 className="font-semibold text-brand-black">1. Görselleri seç</h2>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            reset();
          }}
          className="text-sm"
        />
        {files.length > 0 && (
          <p className="text-xs text-gray-500">
            {files.length} dosya seçildi (
            {formatBytes(files.reduce((s, f) => s + f.size, 0))} toplam)
          </p>
        )}
        <p className="text-xs text-gray-400">
          Format: JPG / PNG / WEBP / GIF · Max 5MB/dosya · Tek seferde max 500
          dosya
        </p>
        <button
          onClick={runPreview}
          disabled={files.length === 0 || working || pending}
          className="px-4 py-2 bg-brand-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
        >
          {working ? "İşleniyor..." : "Önizle"}
        </button>
      </div>

      {preview && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-brand-black">2. Önizleme</h2>
            <button
              onClick={apply}
              disabled={
                preview.counts.matched === 0 || working || pending
              }
              className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              {working ? "Yükleniyor..." : `Yükle (${preview.counts.matched})`}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Toplam" value={String(preview.counts.total)} />
            <Stat
              label="Eşleşti"
              value={String(preview.counts.matched)}
              good
            />
            <Stat
              label="ISBN yok"
              value={String(preview.counts.unmatched)}
              warn={preview.counts.unmatched > 0}
            />
            <Stat
              label="Geçersiz"
              value={String(preview.counts.invalid)}
              bad={preview.counts.invalid > 0}
            />
          </div>

          {preview.duplicates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <strong>{preview.duplicates.length} ISBN için birden fazla dosya:</strong>{" "}
              {preview.duplicates.slice(0, 10).join(", ")}
              {preview.duplicates.length > 10 ? "…" : ""} — hepsi sırayla
              kaydedilir.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left p-2">Dosya</th>
                  <th className="text-left p-2">ISBN</th>
                  <th className="text-left p-2">Ürün</th>
                  <th className="text-right p-2">Boyut</th>
                  <th className="text-center p-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="p-2 font-mono">{p.filename}</td>
                    <td className="p-2 font-mono text-gray-500">{p.sku}</td>
                    <td className="p-2 text-gray-700">
                      {p.productName ?? "—"}
                    </td>
                    <td className="p-2 text-right text-gray-500">
                      {formatBytes(p.size)}
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[p.status]}`}
                      >
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.counts.total > preview.preview.length && (
              <p className="text-xs text-gray-400 mt-2 text-right">
                İlk {preview.preview.length} satır gösteriliyor (toplam{" "}
                {preview.counts.total})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  good,
  warn,
  bad,
}: {
  label: string;
  value: string;
  good?: boolean;
  warn?: boolean;
  bad?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        good
          ? "border-emerald-200 bg-emerald-50"
          : warn
            ? "border-amber-200 bg-amber-50"
            : bad
              ? "border-red-200 bg-red-50"
              : "border-gray-200 bg-gray-50"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`text-xl font-bold mt-0.5 ${
          good
            ? "text-emerald-700"
            : warn
              ? "text-amber-700"
              : bad
                ? "text-red-700"
                : "text-brand-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
