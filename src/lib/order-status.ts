import type { OrderStatus } from "@prisma/client";

/**
 * Sipariş durum geçiş state-machine'i — TEK KAYNAK.
 *
 * Tekil sipariş formu (order-status-form.tsx), toplu durum modalı
 * (orders-bulk-status-modal.tsx) ve bulk-status API route'u BURADAN beslenir.
 * Üçü ayrı ayrı tanımlanırsa "UI'da geçerli görünüp backend'de sessizce atlanan"
 * tutarsızlığı doğar (2026-06-08'de yaşandı).
 *
 * Kurallar: DELIVERED final durum. CANCELLED yalnız PENDING'e geri alınabilir
 * (reaktivasyon — stok/kredi tersine çevrilir). Atlamalı geçiş (örn.
 * PENDING→DELIVERED) yasak.
 */
export const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: ["PENDING"],
};

/** Görüntüleme/sıralama için kanonik durum sırası. */
export const STATUS_ORDER: readonly OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_NEXT[from].includes(to);
}

/**
 * Verilen mevcut durumlar kümesinden ulaşılabilen tüm hedef durumların
 * birleşimi (kanonik sırada). Toplu modal sadece bunları gösterir — hiçbir
 * siparişin ulaşamayacağı hedef listeye girmez.
 */
export function reachableTargets(current: readonly OrderStatus[]): OrderStatus[] {
  const set = new Set<OrderStatus>();
  for (const s of current) {
    for (const t of ALLOWED_NEXT[s]) set.add(t);
  }
  return STATUS_ORDER.filter((s) => set.has(s));
}

/** Belirli bir hedefe kaç sipariş geçebilir (geri kalanı backend atlar). */
export function applicableCount(
  current: readonly OrderStatus[],
  to: OrderStatus,
): number {
  return current.filter((s) => canTransition(s, to)).length;
}
