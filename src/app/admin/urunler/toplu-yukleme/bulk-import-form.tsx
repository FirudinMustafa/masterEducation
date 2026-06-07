"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PreviewRow {
  rowIndex: number;
  nopId: number;
  name: string;
  sku: string;
  price: number;
  publisher: string | null;
  category: string | null;
}

interface RowError {
  rowIndex: number;
  errors: string[];
}

interface DryRunResult {
  ok: boolean;
  parsedCount: number;
  errorCount: number;
  mode: "insert" | "upsert";
  willInsert: number;
  willUpdate: number;
  errors: RowError[];
  preview: (PreviewRow & { action?: "insert" | "update" })[];
}

export function BulkImportForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"insert" | "upsert">("insert");
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  function resetAll() {
    setDryRun(null);
    setError(null);
    setSuccess(null);
  }

  async function runPreview() {
    if (!file) return;
    resetAll();
    setWorking(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(
      `/api/admin/products/bulk-import?dryRun=1&mode=${mode}`,
      {
        method: "POST",
        body: fd,
      }
    );
    setWorking(false);
    const data = (await res.json().catch(() => ({}))) as Partial<DryRunResult> & { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Preview başarısız.");
      return;
    }
    setDryRun(data as DryRunResult);
  }

  async function confirm() {
    if (!file || !dryRun || !dryRun.ok) return;
    setError(null);
    setWorking(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/products/bulk-import?mode=${mode}`, {
      method: "POST",
      body: fd,
    });
    setWorking(false);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      inserted?: number;
      updated?: number;
      mode?: string;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Yükleme başarısız.");
      return;
    }
    if (data.mode === "upsert") {
      setSuccess(
        `${data.inserted ?? 0} ürün eklendi, ${data.updated ?? 0} ürün güncellendi.`
      );
    } else {
      setSuccess(`${data.inserted} ürün eklendi.`);
    }
    setDryRun(null);
    setFile(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-brand-black mb-3">1. Sablon</h2>
        {/* File-download API route — next/link is for page navigation, plain
            <a> is the correct element for server-generated file downloads. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/admin/products/template"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          Excel Sablonu İndir
        </a>
        <p className="text-xs text-gray-500 mt-2">
          Sablonda &quot;Ürünler&quot;, &quot;Yayınevleri&quot; ve &quot;Kategoriler&quot; sayfalari vardir.
          Ürün satirlarini &quot;Ürünler&quot; sayfasina ekleyin.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-brand-black">2. Dosya & Mod</h2>
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1">
            Yükleme modu
          </span>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="insert"
                checked={mode === "insert"}
                onChange={() => {
                  setMode("insert");
                  resetAll();
                }}
              />
              <span>
                <strong>Sadece ekle</strong> — nopId/ISBN varsa hata verir
              </span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="upsert"
                checked={mode === "upsert"}
                onChange={() => {
                  setMode("upsert");
                  resetAll();
                }}
              />
              <span>
                <strong>Ekle veya Güncelle</strong> — nopId varsa günceller
              </span>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              resetAll();
            }}
            className="text-sm"
          />
          <button
            onClick={runPreview}
            disabled={!file || working || pending}
            className="px-4 py-2 bg-brand-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
          >
            {working ? "Isleniyor..." : "Preview"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      {dryRun && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-brand-black">3. Preview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Okunan satir" value={String(dryRun.parsedCount + dryRun.errorCount)} />
            <Stat label="Gecerli satir" value={String(dryRun.parsedCount)} good />
            {dryRun.mode === "upsert" && (
              <>
                <Stat label="Yeni eklenecek" value={String(dryRun.willInsert)} good />
                <Stat label="Güncellenecek" value={String(dryRun.willUpdate)} />
              </>
            )}
            <Stat
              label="Hatali satir"
              value={String(dryRun.errorCount)}
              bad={dryRun.errorCount > 0}
            />
          </div>

          {dryRun.errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-700">
                {dryRun.errors.length} satirda hata:
              </p>
              <ul className="text-xs text-red-700 max-h-64 overflow-auto space-y-1">
                {dryRun.errors.slice(0, 50).map((e) => (
                  <li key={e.rowIndex}>
                    <strong>Satir {e.rowIndex}:</strong> {e.errors.join(" · ")}
                  </li>
                ))}
                {dryRun.errors.length > 50 && (
                  <li>... ve {dryRun.errors.length - 50} satir daha</li>
                )}
              </ul>
            </div>
          )}

          {dryRun.preview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-brand-black mb-2">
                Ilk {dryRun.preview.length} gecerli satir:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left p-2">Satir</th>
                      <th className="text-left p-2">nopId</th>
                      <th className="text-left p-2">ISBN</th>
                      <th className="text-left p-2">Ürün</th>
                      <th className="text-left p-2">Yayınevi</th>
                      <th className="text-left p-2">Kategori</th>
                      <th className="text-right p-2">Fiyat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRun.preview.map((p) => (
                      <tr key={p.rowIndex} className="border-b border-gray-50">
                        <td className="p-2 text-gray-500">{p.rowIndex}</td>
                        <td className="p-2 font-mono">
                          {p.nopId}
                          {p.action === "update" && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700">
                              güncelle
                            </span>
                          )}
                          {p.action === "insert" && (
                            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-emerald-100 text-emerald-700">
                              yeni
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono">{p.sku}</td>
                        <td className="p-2">{p.name}</td>
                        <td className="p-2">{p.publisher ?? "—"}</td>
                        <td className="p-2">{p.category ?? "—"}</td>
                        <td className="p-2 text-right font-medium">
                          {p.price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex items-center gap-3">
            <button
              onClick={confirm}
              disabled={!dryRun.ok || working || pending}
              className="px-5 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark disabled:opacity-50 cursor-pointer"
            >
              {working ? "Yükleniyor..." : `Yükle (${dryRun.parsedCount} ürün)`}
            </button>
            {!dryRun.ok && (
              <span className="text-xs text-red-700">
                Once hatali satirlari duzeltin.
              </span>
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
  bad,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        good
          ? "border-green-200 bg-green-50"
          : bad
            ? "border-red-200 bg-red-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p
        className={`text-xl font-bold mt-1 ${
          good ? "text-green-700" : bad ? "text-red-700" : "text-brand-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
