"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useToastStore, type ToastKind } from "@/stores/toast-store";
import {
  CheckCircleIconSolid,
  InformationCircleIconSolid,
  ExclamationCircleIconSolid,
  XCircleIconSolid,
  XMarkIcon,
  ArrowRightIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Apple/Linear-vari modern toast.
 *
 * Mobile: ust-orta, slide-down, safe-area-inset-top dahil, tap-to-dismiss.
 * Desktop: sag-alt, slide-up, max-w-sm. Hem ikonlu hem progress bar'li.
 *
 * Performans: enter/exit animasyonlari CSS data-state ile; ek lib yok.
 */

const KIND_THEME: Record<
  ToastKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconBg: string;
    iconColor: string;
    progress: string;
  }
> = {
  success: {
    icon: CheckCircleIconSolid,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    progress: "bg-emerald-500",
  },
  info: {
    icon: InformationCircleIconSolid,
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    progress: "bg-sky-500",
  },
  warning: {
    icon: ExclamationCircleIconSolid,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    progress: "bg-amber-500",
  },
  error: {
    icon: XCircleIconSolid,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    progress: "bg-rose-500",
  },
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Mobile: top-center, Desktop: bottom-right.
  // Container kendi positioning yapar; her toast kendi animasyonunu kontrol eder.
  return (
    <>
      {/* MOBILE — üst orta */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-3 md:hidden"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            onDismiss={() => dismiss(t.id)}
            placement="top"
          />
        ))}
      </div>

      {/* DESKTOP — sağ alt */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 right-6 z-[100] hidden flex-col items-end gap-2 md:flex"
      >
        {toasts.map((t) => (
          <ToastCard
            key={t.id}
            toast={t}
            onDismiss={() => dismiss(t.id)}
            placement="bottom"
          />
        ))}
      </div>
    </>
  );
}

interface ToastCardProps {
  toast: ReturnType<typeof useToastStore.getState>["toasts"][number];
  onDismiss: () => void;
  placement: "top" | "bottom";
}

function ToastCard({ toast: t, onDismiss, placement }: ToastCardProps) {
  const theme = KIND_THEME[t.kind];
  const Icon = theme.icon;
  // Auto-dismiss süresi store'da setTimeout ile yönetiliyor (default 3500ms).
  // Burada progress bar süresi sabitlerle senkronize ediliyor; gerçek dismissal
  // store tarafından zaten yapılıyor.
  const DURATION_MS = 3500;

  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dismissedRef = useRef(false);

  // Enter animasyonu — bir frame sonra "open" state'e geç
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Smooth dismiss — önce exit animasyonu, sonra store'dan kaldır
  function handleDismiss() {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setLeaving(true);
    setTimeout(onDismiss, 200);
  }

  // Swipe-to-dismiss (mobile) — yatay kaydırma 60px üzerinde dismiss et
  const dragRef = useRef({ startX: 0, startY: 0, deltaX: 0, dragging: false });
  const [dragX, setDragX] = useState(0);

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      deltaX: 0,
      dragging: true,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    dragRef.current.deltaX = dx;
    setDragX(dx);
  }
  function onPointerUp() {
    if (Math.abs(dragRef.current.deltaX) > 80) {
      handleDismiss();
    } else {
      setDragX(0);
    }
    dragRef.current.dragging = false;
  }

  const slideFrom =
    placement === "top"
      ? "-translate-y-6 opacity-0"
      : "translate-y-4 opacity-0";

  return (
    <div
      data-state={leaving ? "closed" : entered ? "open" : "closed"}
      className={cn(
        "pointer-events-auto w-full max-w-[calc(100vw-24px)] sm:max-w-md",
        "transition-all duration-300 ease-out will-change-transform",
        leaving || !entered ? slideFrom : "translate-y-0 opacity-100"
      )}
      style={{
        transform:
          dragX !== 0
            ? `translateX(${dragX}px)`
            : leaving || !entered
              ? undefined
              : "translateY(0)",
        opacity: dragX !== 0 ? 1 - Math.min(1, Math.abs(dragX) / 200) : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-neutral-200/70 bg-white/95 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.06)] backdrop-blur-xl",
          "ring-1 ring-black/[0.02]"
        )}
      >
        <div className="flex items-start gap-3 p-3.5 pr-2.5">
          {/* Icon disc */}
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              theme.iconBg
            )}
          >
            <Icon className={cn("h-5 w-5", theme.iconColor)} />
          </span>

          {/* Body */}
          <div className="min-w-0 flex-1 py-0.5">
            <p className="text-[14px] font-semibold leading-tight text-neutral-950">
              {t.title}
            </p>
            {t.description && (
              <p className="mt-1 text-[12.5px] leading-snug text-neutral-500">
                {t.description}
              </p>
            )}
            {t.actionHref && t.actionLabel && (
              <Link
                href={t.actionHref}
                className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-neutral-900 hover:gap-1.5 transition-all"
                onClick={handleDismiss}
              >
                {t.actionLabel}
                <ArrowRightIcon className="h-3 w-3" />
              </Link>
            )}
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            aria-label="Kapat"
            className="-m-1 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors cursor-pointer"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar — auto-dismiss visual cue */}
        <span
          aria-hidden
          className={cn("absolute bottom-0 left-0 h-[2px]", theme.progress)}
          style={{
            width: "100%",
            animation: `toast-progress ${DURATION_MS}ms linear forwards`,
          }}
        />
      </div>

      <style jsx>{`
        @keyframes toast-progress {
          from {
            transform: scaleX(1);
            transform-origin: left;
          }
          to {
            transform: scaleX(0);
            transform-origin: left;
          }
        }
      `}</style>
    </div>
  );
}
