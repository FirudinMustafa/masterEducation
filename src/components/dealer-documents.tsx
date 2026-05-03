"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DealerDocumentKind, DealerDocumentStatus } from "@prisma/client";

const KIND_LABELS: Record<DealerDocumentKind, string> = {
  TAX_CERTIFICATE: "Vergi Levhasi",
  TRADE_REG_GAZETTE: "Ticaret Sicil Gazetesi",
  SIGNATURE_CIRCULAR: "Imza Sirkuleri",
  OTHER: "Diger",
};

const KIND_ORDER: DealerDocumentKind[] = [
  "TAX_CERTIFICATE",
  "TRADE_REG_GAZETTE",
  "SIGNATURE_CIRCULAR",
  "OTHER",
];

const STATUS_BADGE: Record<DealerDocumentStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};
const STATUS_LABEL: Record<DealerDocumentStatus, string> = {
  PENDING: "Inceleniyor",
  APPROVED: "Onayli",
  REJECTED: "Reddedildi",
};

export interface DealerDocumentItem {
  id: string;
  kind: DealerDocumentKind;
  filename: string;
  origName: string;
  sizeBytes: number;
  createdAt: Date | string;
  status: DealerDocumentStatus;
  reviewNote: string | null;
  reviewedAt: Date | string | null;
}

interface DealerDocumentsProps {
  documents: DealerDocumentItem[];
  uploadUrl: string;
  deleteUrlTemplate: string; // e.g. `/api/dealer/documents/{id}`
  /** Admin-only review endpoint: `/api/admin/dealers/[dealerId]/documents/{id}` */
  reviewUrlTemplate?: string;
  canEdit: boolean;
  /** Admin'in "Onayla / Reddet" butonlarini gormesi icin. */
  canReview?: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DealerDocuments({
  documents,
  uploadUrl,
  deleteUrlTemplate,
  reviewUrlTemplate,
  canEdit,
  canReview,
}: DealerDocumentsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<DealerDocumentKind>("TAX_CERTIFICATE");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    const res = await fetch(uploadUrl, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Yukleme basarisiz.");
      return;
    }
    setMessage("Belge yuklendi. Admin incelemesi bekleniyor.");
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Belge silinsin mi?")) return;
    const res = await fetch(deleteUrlTemplate.replace("{id}", id), {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Silinemedi.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function review(id: string, status: DealerDocumentStatus) {
    if (!reviewUrlTemplate) return;
    setError(null);
    setMessage(null);
    const note = status === "REJECTED" ? reviewNote.trim() : null;
    if (status === "REJECTED" && !note) {
      setError("Red icin aciklama girmelisiniz.");
      return;
    }
    const res = await fetch(reviewUrlTemplate.replace("{id}", id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNote: note }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Guncelleme basarisiz.");
      return;
    }
    setMessage(status === "APPROVED" ? "Belge onaylandi." : "Belge reddedildi.");
    setReviewingId(null);
    setReviewNote("");
    startTransition(() => router.refresh());
  }

  const grouped = new Map<DealerDocumentKind, DealerDocumentItem[]>();
  for (const d of documents) {
    const arr = grouped.get(d.kind) ?? [];
    arr.push(d);
    grouped.set(d.kind, arr);
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {canEdit && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[200px]">
            <span className="block text-xs font-medium text-gray-500 mb-1">
              Belge Tipi
            </span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as DealerDocumentKind)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="px-4 py-2 bg-brand-gold text-brand-black rounded-lg text-sm font-semibold hover:bg-brand-gold-dark cursor-pointer whitespace-nowrap">
            {uploading ? "Yukleniyor..." : "Dosya Sec"}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading || pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
          </label>
          <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
            PDF, JPG, PNG veya WEBP · en fazla 8MB
          </p>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-center text-gray-500">
          Henuz belge yuklenmemis.
        </div>
      ) : (
        KIND_ORDER.map((k) => {
          const items = grouped.get(k);
          if (!items || items.length === 0) return null;
          return (
            <div
              key={k}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold uppercase text-gray-600">
                {KIND_LABELS[k]}
              </div>
              <ul className="divide-y divide-gray-100">
                {items.map((d) => (
                  <li key={d.id} className="p-3 text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <a
                          href={`/api/dealer/documents/${d.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-brand-gold-dark hover:underline line-clamp-1"
                        >
                          {d.origName}
                        </a>
                        <p className="text-xs text-gray-500">
                          {fmtSize(d.sizeBytes)} ·{" "}
                          {new Date(d.createdAt).toLocaleDateString("tr-TR")}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${STATUS_BADGE[d.status]}`}
                      >
                        {STATUS_LABEL[d.status]}
                      </span>
                      {canEdit && !canReview && (
                        <button
                          onClick={() => remove(d.id)}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          Sil
                        </button>
                      )}
                    </div>

                    {d.status === "REJECTED" && d.reviewNote && (
                      <div className="rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-700">
                        <strong>Admin notu:</strong> {d.reviewNote}
                      </div>
                    )}

                    {canReview && reviewUrlTemplate && (
                      <div className="pt-2 border-t border-gray-100">
                        {reviewingId === d.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                              placeholder="Red sebebi (zorunlu) / onay notu (opsiyonel)"
                              rows={2}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => review(d.id, "APPROVED")}
                                disabled={pending}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 disabled:opacity-50 cursor-pointer"
                              >
                                Onayla
                              </button>
                              <button
                                onClick={() => review(d.id, "REJECTED")}
                                disabled={pending}
                                className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                              >
                                Reddet
                              </button>
                              <button
                                onClick={() => {
                                  setReviewingId(null);
                                  setReviewNote("");
                                }}
                                className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded cursor-pointer"
                              >
                                Iptal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            {d.status !== "APPROVED" && (
                              <button
                                onClick={() => {
                                  setReviewingId(d.id);
                                  setReviewNote("");
                                }}
                                className="px-2 py-1 text-xs font-medium text-brand-gold-dark hover:underline cursor-pointer"
                              >
                                Incele
                              </button>
                            )}
                            {d.status !== "PENDING" && (
                              <button
                                onClick={() => review(d.id, "PENDING")}
                                disabled={pending}
                                className="px-2 py-1 text-xs text-gray-500 hover:underline cursor-pointer"
                              >
                                Durumu sifirla
                              </button>
                            )}
                            <button
                              onClick={() => remove(d.id)}
                              className="px-2 py-1 text-xs text-red-600 hover:underline cursor-pointer ml-auto"
                            >
                              Sil
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}
