"use client";

import { create } from "zustand";

export interface LoginGateReason {
  title: string;
  description?: string;
  /** Where to return to after login (absolute path). Defaults to current URL. */
  callbackUrl?: string;
}

interface LoginGateState {
  open: boolean;
  reason: LoginGateReason | null;
  show: (reason: LoginGateReason) => void;
  hide: () => void;
}

export const useLoginGate = create<LoginGateState>((set) => ({
  open: false,
  reason: null,
  show: (reason) => set({ open: true, reason }),
  hide: () => set({ open: false }),
}));

/** Shortcut — use from any client component. */
export function openLoginGate(reason: LoginGateReason) {
  useLoginGate.getState().show(reason);
}
