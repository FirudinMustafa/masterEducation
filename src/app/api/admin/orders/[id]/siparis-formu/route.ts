import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import {
  createBrandedWorkbook,
  excelResponse,
  BRAND,
} from "@/lib/excel-branding";

/**
 * Sipariş Formu (Excel) dışa aktarma — admin sipariş detayından indirilir.
 *
 * Kullanıcının verdiği `master sipariş formu.xlsx` şablonunu, siparişin verisiyle
 * doldurup üretir. Düzen (B–E sütunları):
 *   Satır 2 (birleşik): "SİPARİŞ VEREN FİRMA"   (etiket)
 *   Satır 3 (birleşik): bayi firma adı           (değer)
 *   Satır 4 (birleşik): "OKUL ADI"               (etiket)
 *   Satır 5 (birleşik): okul adı                 (değer)
 *   Satır 6 (birleşik): "SİPARİŞ"                (başlık)
 *   Satır 7: ÜRÜN | ISBN | SİPARİŞ ADETİ | ÖĞRETMEN PACK   (tablo başlığı)
 *   Satır 8+: sipariş kalemleri (ÖĞRETMEN PACK boş — elle doldurulur)
 *
 * GET /api/admin/orders/[id]/siparis-formu
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      orderNumber: true,
      schoolName: true,
      items: {
        select: { productName: true, productSku: true, quantity: true },
        orderBy: { id: "asc" },
      },
      user: { select: { dealer: { select: { companyName: true } } } },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Sipariş bulunamadi." }, { status: 404 });
  }

  const wb = createBrandedWorkbook();
  const sheet = wb.addWorksheet("Sayfa1");

  // Orijinal şablonun sütun genişlikleri (B/C/D/E).
  sheet.getColumn(2).width = 51;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 16;

  const thin = { style: "thin" as const, color: { argb: BRAND.softGray } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

  // ── Etiket/değer satırları (B2:E6 birleşik) ──
  const bandRows: Array<{ row: number; text: string; isLabel: boolean }> = [
    { row: 2, text: "SİPARİŞ VEREN FİRMA", isLabel: true },
    { row: 3, text: order.user?.dealer?.companyName ?? "", isLabel: false },
    { row: 4, text: "OKUL ADI", isLabel: true },
    { row: 5, text: order.schoolName ?? "", isLabel: false },
    { row: 6, text: "SİPARİŞ", isLabel: true },
  ];
  for (const b of bandRows) {
    sheet.mergeCells(`B${b.row}:E${b.row}`);
    const cell = sheet.getCell(`B${b.row}`);
    cell.value = b.text;
    cell.font = {
      name: "Calibri",
      size: b.row === 6 ? 13 : 11,
      bold: b.isLabel,
      color: { argb: BRAND.black },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: b.row === 6 ? "center" : "left",
    };
    if (b.isLabel) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: BRAND.warmGray },
      };
    }
    // Birleşik aralığın tüm hücrelerine kenarlık.
    for (let c = 2; c <= 5; c++) {
      sheet.getRow(b.row).getCell(c).border = allBorders;
    }
    sheet.getRow(b.row).height = 20;
  }

  // ── Tablo başlığı (satır 7) ──
  const headers = ["ÜRÜN", "ISBN", "SİPARİŞ ADETİ", "ÖĞRETMEN PACK"];
  const headerRow = sheet.getRow(7);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 2); // B,C,D,E
    cell.value = h;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.black } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.gold },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = allBorders;
  });
  headerRow.height = 22;

  // ── Sipariş kalemleri (satır 8+) ──
  order.items.forEach((item, idx) => {
    const r = sheet.getRow(8 + idx);
    const values: (string | number)[] = [
      item.productName,
      item.productSku,
      item.quantity,
      "", // ÖĞRETMEN PACK — boş, elle doldurulur
    ];
    values.forEach((v, i) => {
      const cell = r.getCell(i + 2);
      cell.value = v;
      cell.font = { name: "Calibri", size: 10, color: { argb: BRAND.black } };
      cell.alignment = {
        vertical: "middle",
        horizontal: i === 2 ? "center" : "left",
      };
      cell.border = allBorders;
    });
    r.height = 18;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const safeNo = order.orderNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return excelResponse(
    buffer as ArrayBuffer,
    `siparis-formu-${safeNo}.xlsx`,
    `sipariş-formu-${order.orderNumber}.xlsx`
  );
}
