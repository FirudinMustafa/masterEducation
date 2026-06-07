import { NextResponse } from "next/server";

/**
 * Müşteri kaydı devre dışı — sistem yalnızca bayilere açıktır.
 * Bayi olmak için /bayi-basvuru üzerinden başvurulur veya admin bayi oluşturur.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Müşteri kaydı kapalıdır. Sistem yalnızca bayilere açıktır — bayi başvurusu yapabilirsiniz.",
    },
    { status: 410 },
  );
}
