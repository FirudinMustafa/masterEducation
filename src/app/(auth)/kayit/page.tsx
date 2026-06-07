import { redirect } from "next/navigation";

/**
 * Müşteri kaydı kaldırıldı — sistem yalnızca bayilere açıktır.
 * Bu sayfa bayi başvuru formuna yönlendirir.
 */
export default function KayitPage() {
  redirect("/bayi-basvuru");
}
