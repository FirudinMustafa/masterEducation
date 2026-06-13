import type { OrderStatus } from "@prisma/client";

/**
 * Sipariş durum geçiş state-machine'i — TEK KAYNAK.
 *
 * Tekil sipariş formu (order-status-form.tsx), toplu durum modalı
 * (orders-bulk-status-modal.tsx), bulk-status ve tekil status API route'ları
 * BURADAN beslenir.
 *
 * okultedarigim modeli (2026-06-13): Gelen Sipariş (PENDING/APPROVED) →
 * Hazırlanıyor (PROCESSING) → Dağıtımda (SHIPPED) → Tamamlandı (DELIVERED);
 * Dağıtımda'dan Teslim Edilemeyen'e (UNDELIVERED) düşebilir ve tekrar dağıtıma
 * verilebilir. Her aşamadan İptal/İade'ye (CANCELLED) geçilebilir; Tamamlandı'dan
 * da iade için İptal/İade'ye geçilebilir. İptal/İade yalnız Gelen Sipariş'e
 * (PENDING) geri alınabilir (reaktivasyon — stok/kredi tersine çevrilir).
 *
 * Not: PENDING ve APPROVED aynı kovadır (kart ödemesi APPROVED set eder); ikisi de
 * "Hazırlanıyor" veya "İptal/İade"ye geçebilir.
 */
export const ALLOWED_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  APPROVED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "UNDELIVERED", "CANCELLED"],
  UNDELIVERED: ["SHIPPED", "CANCELLED"],
  DELIVERED: ["CANCELLED"],
  CANCELLED: ["PENDING"],
};

/** Görüntüleme/sıralama için kanonik durum sırası. */
export const STATUS_ORDER: readonly OrderStatus[] = [
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "SHIPPED",
  "UNDELIVERED",
  "DELIVERED",
  "CANCELLED",
];

/**
 * Kullanıcıya gösterilen okultedarigim "durum kovaları". Bazı kovalar birden çok
 * iç enum koduna karşılık gelir (Gelen Sipariş = PENDING + APPROVED). Filtre
 * butonları ve sayımlar bu kovalardan üretilir.
 */
export interface DisplayStatus {
  key: string; // URL/filter anahtarı
  label: string; // Türkçe etiket
  codes: OrderStatus[]; // bu kovaya düşen iç enum kodları
}

export const DISPLAY_STATUSES: readonly DisplayStatus[] = [
  { key: "gelen", label: "Gelen Sipariş", codes: ["PENDING", "APPROVED"] },
  { key: "hazirlaniyor", label: "Hazırlanıyor", codes: ["PROCESSING"] },
  { key: "dagitimda", label: "Dağıtımda", codes: ["SHIPPED"] },
  { key: "teslim-edilemeyen", label: "Teslim Edilemeyen", codes: ["UNDELIVERED"] },
  { key: "tamamlandi", label: "Tamamlandı", codes: ["DELIVERED"] },
  { key: "iptal-iade", label: "İptal/İade", codes: ["CANCELLED"] },
];

/** Bir durum kodunun ait olduğu görünüm kovası. */
export function bucketForStatus(status: OrderStatus): DisplayStatus {
  return (
    DISPLAY_STATUSES.find((d) => d.codes.includes(status)) ?? DISPLAY_STATUSES[0]
  );
}

/** Her kovanın kanonik (DB'ye yazılacak) kodu — codes[0]. */
export function canonicalCode(bucket: DisplayStatus): OrderStatus {
  return bucket.codes[0];
}

/**
 * Durum seçiminin tam listesi (6 kovanın kanonik kodları, kanonik sırada).
 * Admin tekil/toplu güncellemede HER duruma elle geçebilir (okultedarigim gibi).
 */
export const ALL_TARGET_STATUSES: readonly OrderStatus[] = DISPLAY_STATUSES.map(
  (d) => d.codes[0]
);

/**
 * Bir filtre parametresini (`durum`) iç enum kodları listesine çevirir.
 * Kabul edilenler: kova anahtarı (örn. "gelen") veya ham enum kodu (örn.
 * "PENDING" → ait olduğu kovanın tüm kodları). Eşleşme yoksa null (filtresiz).
 */
export function resolveStatusFilter(durum: string): OrderStatus[] | null {
  if (!durum) return null;
  const byKey = DISPLAY_STATUSES.find((d) => d.key === durum);
  if (byKey) return byKey.codes;
  const byCode = DISPLAY_STATUSES.find((d) =>
    d.codes.includes(durum as OrderStatus)
  );
  return byCode ? byCode.codes : null;
}

/**
 * Serbest durum modeli (2026-06-14): admin herhangi bir duruma elle geçebilir.
 * Eski sıralı kısıt kaldırıldı (okultedarigim davranışı). ALLOWED_NEXT yalnızca
 * "doğal akış" referansı olarak kalır. Veri bütünlüğü geçişin TİPİNE bağlı
 * yan-etkilerle korunur: → İptal/İade'de stok/cari iade; İptal/İade'den çıkışta
 * reaktivasyon (stok/cari geri yükleme) — bkz. order-side-effects.ts ve route'lar.
 */
export function canTransition(_from: OrderStatus, _to: OrderStatus): boolean {
  return true;
}

/** Toplu/tekil seçim: tüm kovaların kanonik kodları (serbest seçim). */
export function reachableTargets(_current: readonly OrderStatus[]): OrderStatus[] {
  return [...ALL_TARGET_STATUSES];
}

/** Serbest seçimde hedefe tüm seçili siparişler uygulanabilir. */
export function applicableCount(
  current: readonly OrderStatus[],
  _to: OrderStatus,
): number {
  return current.length;
}
