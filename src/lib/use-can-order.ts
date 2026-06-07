"use client";

import { useSession } from "next-auth/react";
import { openLoginGate } from "@/stores/login-gate-store";

/**
 * Bayi-only sistem: sepete ekleme / sipariş yalnız giriş yapmış ONAYLI bayide
 * aktiftir. Ziyaretçi ve onaysız bayi sipariş veremez.
 */
export function useCanOrder(): boolean {
  const { data } = useSession();
  return data?.user?.role === "DEALER" && data.user.dealerStatus === "APPROVED";
}

/**
 * Sipariş gerektiren bir aksiyondan önce çağrılır. Bayi değilse login-gate
 * modalını açar ve `false` döner (aksiyon iptal edilmeli).
 */
export function ensureCanOrder(canOrder: boolean): boolean {
  if (canOrder) return true;
  openLoginGate({
    title: "Sipariş için bayi girişi",
    description:
      "Sepete eklemek ve sipariş vermek için bayi girişi yapın ya da bayi başvurusu oluşturun.",
  });
  return false;
}
