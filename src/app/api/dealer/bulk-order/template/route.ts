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

  buildBrandedSheet(wb, "Siparis", {
    title: "Toplu Siparis Sablonu",
    subtitle: `Bayi: ${session.user.name ?? ""}  ·  ${new Date().toLocaleDateString("tr-TR")}`,
    intro:
      "Asagidaki formati koruyarak satirlari doldurun. ISBN ve miktar zorunlu alanlardir. Bulunamayan urunler ve stok yetersizligi yuklemeden sonra raporlanir.",
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

  buildBrandedSheet(wb, "Aciklama", {
    title: "Kullanim Rehberi",
    subtitle: "Toplu siparis sablon aciklamasi",
    columns: [
      { header: "Kolon", key: "col", width: 20 },
      { header: "Aciklama", key: "desc", width: 70 },
    ],
    rows: [
      { col: "ISBN", desc: "Urun ISBN'i. Sitemizdeki urun detay sayfasinda veya iskonto Excel'inizde bulabilirsiniz." },
      { col: "Adet", desc: "1 veya daha fazla. Stok miktarindan fazla olursa ilgili satir reddedilir." },
      { col: "Not", desc: "Opsiyonel. Siparis notunuza eklenmez; sadece sizin icin." },
    ],
  });

  const buffer = await wb.xlsx.writeBuffer();
  return excelResponse(buffer as ArrayBuffer, "toplu-siparis-sablon.xlsx");
}
