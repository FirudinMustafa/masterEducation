import { NextResponse } from "next/server";

/**
 * Cari ekstre export'u devre dışı — fiyat/bakiye bilgileri bayilerden gizlendi.
 * Mali/muhasebe export'ları yalnız admin tarafında (/api/admin/accounting/export)
 * yapılır. Bu uç nokta artık 403 döner.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Bu özellik kullanım dışıdır." },
    { status: 403 },
  );
}
