"use client";

import type { ReactNode } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger" | "success";
  busy?: boolean;
  onConfirm: () => void;
  /** Verilmezse "alert" modu — yalnız tek (onay) butonu gösterilir. */
  onCancel?: () => void;
}

const TONE_BTN: Record<NonNullable<ConfirmDialogProps["tone"]>, string> = {
  default: "bg-brand-gold text-brand-black hover:bg-brand-gold-dark",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};

/**
 * Genel onay/bilgi modal'ı. Durum güncellemelerinde "önce onay → sonra başarı"
 * akışı için kullanılır. onCancel verilmezse alert (tek buton) gibi davranır.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  const isAlert = !onCancel;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
      onClick={() => !busy && onCancel?.()}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-display font-bold text-brand-black">
            {title}
          </h2>
          {message && (
            <div className="mt-2 text-sm text-gray-600">{message}</div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          {!isAlert && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 text-sm text-gray-600 hover:text-brand-black disabled:opacity-50 cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 cursor-pointer ${TONE_BTN[tone]}`}
          >
            {busy ? "..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
