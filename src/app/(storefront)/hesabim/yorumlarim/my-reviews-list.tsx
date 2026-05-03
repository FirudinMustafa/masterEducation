"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewStatus } from "@prisma/client";
import { StarRow } from "@/components/products/product-reviews";
import { toast } from "@/stores/toast-store";

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  status: ReviewStatus;
  createdAt: string;
  product: {
    slug: string;
    name: string;
    imageSrc: string | null;
  };
}

const STATUS_META: Record<ReviewStatus, { label: string; cls: string }> = {
  APPROVED: { label: "Yayinda", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Inceleniyor", cls: "bg-amber-50 text-amber-700" },
  REJECTED: { label: "Reddedildi", cls: "bg-rose-50 text-rose-700" },
};

export function MyReviewsList({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function remove(reviewId: string) {
    if (!confirm("Yorumunuz silinsin mi? Bu islem geri alinamaz.")) return;
    setDeletingId(reviewId);
    const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Silinemedi", data.error ?? "Sunucu hatasi");
      return;
    }
    toast.info("Yorum silindi");
    startTransition(() => router.refresh());
  }

  return (
    <ul className="space-y-3">
      {reviews.map((r) => {
        const status = STATUS_META[r.status];
        return (
          <li
            key={r.id}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex gap-4">
              <Link
                href={`/urunler/${r.product.slug}`}
                className="shrink-0 h-20 w-20 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
              >
                {r.product.imageSrc ? (
                  <Image
                    src={r.product.imageSrc}
                    alt={r.product.name}
                    width={80}
                    height={80}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-neutral-400">
                    Gorsel yok
                  </div>
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/urunler/${r.product.slug}`}
                    className="truncate text-sm font-semibold text-neutral-900 hover:underline"
                  >
                    {r.product.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs text-neutral-400">
                      {new Date(r.createdAt).toLocaleDateString("tr-TR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <StarRow rating={r.rating} size="xs" />
                {r.title && (
                  <p className="mt-1 text-sm font-semibold text-neutral-900">
                    {r.title}
                  </p>
                )}
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-700">
                  {r.comment}
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/urunler/${r.product.slug}#reviews`}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Urunde Duzenle
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    {deletingId === r.id ? "Siliniyor..." : "Sil"}
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
