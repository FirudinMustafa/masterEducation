"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  StarIcon,
  StarIconSolid,
  CheckCircleIconSolid,
  ExclamationCircleIconSolid,
} from "@/components/ui/icons";
import { openLoginGate } from "@/stores/login-gate-store";
import { toast } from "@/stores/toast-store";
import { cn } from "@/lib/utils";

// Deferred-auth: when an anonymous user fills out a review and clicks send,
// we stash the draft in sessionStorage (survives across the login redirect)
// and trigger the login modal. After login, on re-mount we find the draft
// and auto-submit it, so the user doesn't have to re-type anything.
const DRAFT_KEY = (productId: string) => `pending-review:${productId}`;

interface PendingReview {
  rating: number;
  title: string;
  comment: string;
}

function readDraft(productId: string): PendingReview | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY(productId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingReview;
  } catch {
    return null;
  }
}

function writeDraft(productId: string, draft: PendingReview) {
  try {
    sessionStorage.setItem(DRAFT_KEY(productId), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function clearDraft(productId: string) {
  try {
    sessionStorage.removeItem(DRAFT_KEY(productId));
  } catch {
    /* ignore */
  }
}

interface Review {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  createdAt: Date | string;
  authorName: string;
  isOwn?: boolean;
}

interface Props {
  productId: string;
  reviews: Review[];
  ratingAverage: number | null;
  ratingCount: number;
  canReview: boolean;
  userAlreadyReviewed: boolean;
}

export function ProductReviews({
  productId,
  reviews,
  ratingAverage,
  ratingCount,
  canReview,
  userAlreadyReviewed,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const autoSubmittedRef = useRef(false);

  async function sendReview(payload: PendingReview): Promise<boolean> {
    setError(null);
    setSuccess(null);
    const isEdit = editingId != null;
    const url = isEdit ? `/api/reviews/${editingId}` : "/api/reviews";
    const body = isEdit
      ? {
          rating: payload.rating,
          title: payload.title || null,
          comment: payload.comment,
        }
      : {
          productId,
          rating: payload.rating,
          title: payload.title || null,
          comment: payload.comment,
        };
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Gonderilemedi.");
      return false;
    }
    setSuccess(data.message ?? "Yorumunuz alindi.");
    setTitle("");
    setComment("");
    setRating(5);
    setShowForm(false);
    setEditingId(null);
    startTransition(() => router.refresh());
    return true;
  }

  function startEdit(review: Review) {
    setEditingId(review.id);
    setRating(review.rating);
    setTitle(review.title ?? "");
    setComment(review.comment);
    setShowForm(true);
    setError(null);
    setSuccess(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle("");
    setComment("");
    setRating(5);
    setShowForm(false);
    setError(null);
  }

  async function deleteReview(reviewId: string) {
    if (!confirm("Yorumunuz silinsin mi? Bu islem geri alinamaz.")) return;
    setError(null);
    const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error("Silinemedi", data.error ?? "Sunucu hatasi");
      return;
    }
    toast.info("Yorum silindi");
    if (editingId === reviewId) cancelEdit();
    startTransition(() => router.refresh());
  }

  // Post-login: if a draft exists and the user is now authorised, fire the
  // submission transparently so typing is never wasted.
  useEffect(() => {
    if (!canReview || userAlreadyReviewed || autoSubmittedRef.current) return;
    const draft = readDraft(productId);
    if (!draft) return;
    autoSubmittedRef.current = true;
    clearDraft(productId);
    (async () => {
      const ok = await sendReview(draft);
      if (ok) {
        toast.success("Yorumunuz gonderildi", "Moderasyon sonrasi yayinlanacak.");
      } else {
        // Re-populate the form so the user can edit and resend.
        setRating(draft.rating);
        setTitle(draft.title);
        setComment(draft.comment);
        setShowForm(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReview, userAlreadyReviewed, productId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Deferred auth — stash draft, open login modal, rely on the post-login
    // effect above to auto-submit. User experience: they click "Gonder", see
    // the login modal, finish signup/login, land back on this page, and a
    // success toast appears sayıng their review was submitted.
    if (!canReview) {
      const draft: PendingReview = { rating, title, comment };
      writeDraft(productId, draft);
      openLoginGate({
        title: "Yorumunuzu Gondermek Icin Giriş",
        description:
          "Yazdiklarinizi kaydettik — giriş yaptiktan sonra otomatik gonderilecek.",
      });
      return;
    }

    await sendReview({ rating, title, comment });
  }

  function onFormFocus() {
    // No-op — we intentionally let unauthenticated users fill out the form.
    // The auth check happens only at submit time.
  }

  return (
    <section>
      {/* Header with rating summary */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          {ratingAverage != null && ratingCount > 0 ? (
            <>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-neutral-900">
                    {ratingAverage.toFixed(1)}
                  </span>
                  <span className="text-sm text-neutral-400">/ 5</span>
                </div>
                <StarRow rating={ratingAverage} size="md" />
              </div>
              <div className="h-10 w-px bg-neutral-200" />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {ratingCount} yorum
                </p>
                <p className="text-xs text-neutral-500">Musteri degerlendirmesi</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                Henuz yorum yok
              </p>
              <p className="text-xs text-neutral-500">
                Ilk yorumu siz yazin, puan oluştursun
              </p>
            </div>
          )}
        </div>

        {/* Action button — visible to everyone; auth is deferred until submit. */}
        {userAlreadyReviewed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircleIconSolid className="h-4 w-4" />
            Yorumunuzu aldik
          </span>
        ) : (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md"
          >
            {showForm ? "Formu Kapat" : "Yorum Yaz"}
          </button>
        )}
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircleIconSolid className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span>{success}</span>
        </div>
      )}

      {/* Write form — rendered for everyone; login prompt fires on submit if
          the user isn't authenticated yet. */}
      {showForm && (!userAlreadyReviewed || editingId) && (
        <form
          onSubmit={submit}
          className="mb-6 space-y-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-5"
        >
          <h3 className="font-semibold text-neutral-900">
            {editingId ? "Yorumunuzu Duzenleyin" : "Yorumunuzu Paylasin"}
          </h3>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <ExclamationCircleIconSolid className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-neutral-700">
              Puaniniz
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = n <= (hoverRating || rating);
                return (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    aria-label={`${n} yildiz`}
                    className="p-0.5 cursor-pointer transition-transform hover:scale-110"
                  >
                    {filled ? (
                      <StarIconSolid className="h-7 w-7 text-amber-400" />
                    ) : (
                      <StarIcon className="h-7 w-7 text-neutral-300" />
                    )}
                  </button>
                );
              })}
              <span className="ml-2 text-sm font-semibold text-neutral-700">
                {rating}/5
              </span>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Baslik (opsiyonel)
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ornegin: Çok kaliteli!"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-neutral-700">
              Yorumunuz *
            </span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onFocus={onFormFocus}
              required
              rows={4}
              minLength={3}
              maxLength={2000}
              placeholder="Ürünu tarif edin, neyi begendiginizi veya begenmediginizi paylasin."
              className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
            <div className="mt-1 text-right text-[11px] text-neutral-400">
              {comment.length}/2000
            </div>
          </label>

          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              Yorumlar otomatik yayinlanir, admin gerekirse kaldirabilir.
            </p>
            <div className="flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  İptal
                </button>
              )}
              <button
                type="submit"
                disabled={pending || comment.length < 3}
                className="rounded-xl bg-brand-gold px-5 py-2.5 text-sm font-bold text-neutral-800 shadow-sm transition-all hover:bg-brand-gold-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {pending
                  ? "Gonderiliyor..."
                  : editingId
                  ? "Degisiklikleri Kaydet"
                  : "Yorumu Gonder"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {reviews.length > 0 && (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={cn(
                "rounded-xl border bg-white p-4",
                r.isOwn ? "border-brand-gold/40 ring-1 ring-brand-gold/20" : "border-neutral-200"
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">
                    {r.authorName.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900">
                    {r.authorName}
                  </span>
                  {r.isOwn && (
                    <span className="rounded-full bg-brand-gold-light/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-800">
                      Siz
                    </span>
                  )}
                  <StarRow rating={r.rating} size="xs" />
                </div>
                <span className="text-xs text-neutral-400">
                  {new Date(r.createdAt).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {r.title && (
                <p className="mb-1 font-semibold text-neutral-900">{r.title}</p>
              )}
              <p className="whitespace-pre-wrap text-sm text-neutral-700">
                {r.comment}
              </p>
              {r.isOwn && (
                <div className="mt-3 flex gap-2 border-t border-neutral-100 pt-3">
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                  >
                    Duzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReview(r.id)}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    Sil
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StarRow({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const px = { xs: "h-3.5 w-3.5", sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" }[size];
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating.toFixed(1)} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = rating >= n - 0.25;
        return filled ? (
          <StarIconSolid key={n} className={cn(px, "text-amber-400")} />
        ) : (
          <StarIcon key={n} className={cn(px, "text-neutral-300")} />
        );
      })}
    </span>
  );
}
