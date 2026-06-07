"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@prisma/client";

interface ReviewRow {
  id: string;
  productName: string;
  productSlug: string;
  authorName: string;
  authorEmail: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  createdAt: Date | string;
}

export function ReviewModeration({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = useMemo(
    () => reviews.length > 0 && reviews.every((r) => selected.has(r.id)),
    [reviews, selected]
  );

  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      const n = new Set(prev);
      for (const r of reviews) n.add(r.id);
      return n;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulkAction(action: "APPROVED" | "REJECTED" | "DELETE") {
    const verb =
      action === "APPROVED"
        ? "yayina al"
        : action === "REJECTED"
          ? "gizle"
          : "kalici olarak sil";
    if (!confirm(`${selected.size} yorumu ${verb}? `)) return;
    setError(null);
    setInfo(null);
    const res = await fetch("/api/admin/reviews/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewIds: [...selected], action }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      error?: string;
      affected?: number;
    };
    if (!res.ok) {
      setError(d.error ?? "Toplu islem başarısız.");
      return;
    }
    setInfo(`${d.affected ?? 0} yorum güncellendi.`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function setStatus(id: string, status: "APPROVED" | "REJECTED") {
    setError(null);
    const res = await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Islem başarısız.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    if (!confirm("Yorumu kalici olarak silmek istiyor musunuz?")) return;
    const res = await fetch(`/api/admin/reviews/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Silinemedi.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3 pb-20">
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

      {reviews.length > 0 && (
        <label className="inline-flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-4 w-4 cursor-pointer"
          />
          Tümunu seç ({reviews.length})
        </label>
      )}

      {reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Yorum yok.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={`bg-white rounded-xl border border-gray-200 p-4 space-y-2 ${
                selected.has(r.id) ? "ring-2 ring-brand-gold/40" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="mt-1 h-4 w-4 cursor-pointer"
                  />
                  <div>
                    <Link
                      href={`/urunler/${r.productSlug}`}
                      target="_blank"
                      className="font-medium text-brand-black hover:text-brand-gold-dark"
                    >
                      {r.productName}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {r.authorName} · {r.authorEmail} ·{" "}
                      {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-brand-gold">
                    {"★★★★★".slice(0, r.rating)}
                    <span className="text-gray-300">
                      {"★★★★★".slice(r.rating)}
                    </span>
                  </span>
                </div>
              </div>
              {r.title && (
                <p className="font-semibold text-brand-black">{r.title}</p>
              )}
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {r.comment}
              </p>
              <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === "APPROVED"
                      ? "bg-green-100 text-green-700"
                      : r.status === "REJECTED"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {r.status === "APPROVED"
                    ? "Yayinda"
                    : r.status === "REJECTED"
                      ? "Gizli"
                      : "Beklemede"}
                </span>
                <div className="ml-auto flex gap-2">
                  {r.status === "APPROVED" && (
                    <button
                      onClick={() => setStatus(r.id, "REJECTED")}
                      disabled={pending}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                      title="Yayindan kaldir (tekrar acilabilir)"
                    >
                      Gizle
                    </button>
                  )}
                  {r.status !== "APPROVED" && (
                    <button
                      onClick={() => setStatus(r.id, "APPROVED")}
                      disabled={pending}
                      className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      Yayina Al
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.id)}
                    disabled={pending}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                  >
                    Sil
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-60 z-30 border-t border-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 flex flex-wrap items-center gap-2 justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-brand-black">
                {selected.size} yorum secildi
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-brand-black underline cursor-pointer"
              >
                Secimi temizle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => bulkAction("APPROVED")}
                disabled={pending}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
              >
                Yayina Al
              </button>
              <button
                onClick={() => bulkAction("REJECTED")}
                disabled={pending}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
              >
                Gizle
              </button>
              <button
                onClick={() => bulkAction("DELETE")}
                disabled={pending}
                className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 cursor-pointer"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
