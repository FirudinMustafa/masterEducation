"use client";

import { create } from "zustand";

export type ToastKind = "success" | "info" | "error" | "warning";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, "id">, durationMs?: number) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (toast, durationMs = 3500) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (durationMs > 0) {
      setTimeout(() => get().dismiss(id), durationMs);
    }
    return id;
  },
  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().show({ kind: "success", title, description }),
  info: (title: string, description?: string) =>
    useToastStore.getState().show({ kind: "info", title, description }),
  error: (title: string, description?: string) =>
    useToastStore.getState().show({ kind: "error", title, description }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().show({ kind: "warning", title, description }),
};
