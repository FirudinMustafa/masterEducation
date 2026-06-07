import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER") {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const wb = createBrandedWorkbook();

  buildBrandedSheet(wb, "Sipariş", {
    title: "Toplu Sipariş Sablonu",
    subtitle: `Bayi: ${session.user.name ?? ""}  ·  ${new Date().toLocaleDateString("tr-TR")}`,
    intro:
      "Asagidaki formati koruyarak satirlari doldurun. ISBN ve miktar zorunlu alanlardir. Bulunamayan ürünler ve stok yetersizligi yüklemeden sonra raporlanir.",
    columns: [
      { header: "ISBN", key: "sku", width: 22 },
      { header: "Adet", key: "quantity", width: 10, numFmt: "0" },
      { header: "Not (opsiyonel)", key: "note", width: 40 },
    ],
    rows: [
      { sku: "9780000000001", quantity: 2, note: "Ornek satir 1" },
      { sku: "9780000000002", quantity: 1, note: "" },
    ],
  });

  buildBrandedSheet(wb, "Açıklama", {
    title: "Kullanim Rehberi",
    subtitle: "Toplu sipariş sablon açıklamasi",
    columns: [
      { header: "Kolon", key: "col", width: 20 },
      { header: "Açıklama", key: "desc", width: 70 },
    ],
    rows: [
      { col: "ISBN", desc: "Ürün ISBN'i. Sitemizdeki ürün detay sayfasinda veya iskonto Excel'inizde bulabilirsiniz." },
      { col: "Adet", desc: "1 veya daha fazla. Stok miktarindan fazla olursa ilgili satir reddedilir." },
      { col: "Not", desc: "Opsiyonel. Sipariş notunuza eklenmez; sadece sizin icin." },
    ],
  });

  const buffer = await wb.xlsx.writeBuffer();
  return excelResponse(buffer as ArrayBuffer, "toplu-siparis-sablon.xlsx");
}
