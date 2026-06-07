import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { ordersToCsv, orderItemsToCsv } from "@/lib/adapters/accounting";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

export async function GET(req: NextRequest) {
  try {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const type = searchParams.get("type") ?? "orders";
  const format = searchParams.get("format") ?? "csv";

  const where: {
    createdAt?: { gte?: Date; lte?: Date };
  } = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      items: true,
      user: { include: { dealer: true } },
    },
  });

  // Bulk PII ihrac iz biraksin — KVKK + ic sorusturma icin admin ne ihrac etti?
  logAudit({
    actorId: gate.session.user.id,
    action: "ACCOUNTING_EXPORT",
    entityType: "order",
    entityId: "bulk",
    metadata: {
      type,
      format,
      from: from ?? null,
      to: to ?? null,
      orderCount: orders.length,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  // HTTP header'lar Latin-1 olmali — Turk karakterleri (ş, ğ, ı, ö, c, u)
  // ByteString'e cevrilemez ve Response constructor throw eder. Bu sebeple
  // filename'i ASCII-safe versiyona indirgiyoruz. RFC 5987 ile UTF-8 fallback
  // ekleyerek modern tarayicilar gercek Turkce ismi gosterebilir.
  const kindLabel = type === "items" ? "sipariş-satirlari" : "siparişler";
  const asciiKindLabel = type === "items" ? "siparis-satirlari" : "siparisler";

  if (format === "xlsx") {
    const wb = createBrandedWorkbook();
    const range = from || to ? `${from ?? "-"} → ${to ?? "-"}` : "Tüm tarihler";

    if (type === "items") {
      const rows = orders.flatMap((o) =>
        o.items.map((item) => ({
          orderNumber: o.orderNumber,
          date: o.createdAt.toLocaleDateString("tr-TR"),
          sku: item.productSku,
          product: item.productName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discountPct: Number(item.discountPct),
          vatRate: Number(item.vatRate),
          vatAmount: Number(item.vatAmount),
          lineTotal: Number(item.lineTotal),
        })),
      );
      buildBrandedSheet(wb, "Sipariş Satirlari", {
        title: "Sipariş Satirlari Raporu",
        subtitle: `Tarih araligi: ${range}  ·  ${rows.length} satir`,
        columns: [
          { header: "Sipariş No", key: "orderNumber", width: 18 },
          { header: "Tarih", key: "date", width: 14 },
          { header: "ISBN", key: "sku", width: 18 },
          { header: "Ürün", key: "product", width: 40 },
          { header: "Adet", key: "quantity", width: 8, numFmt: "0" },
          { header: "Birim Fiyat", key: "unitPrice", width: 14, numFmt: "#,##0.00" },
          { header: "İskonto %", key: "discountPct", width: 12, numFmt: "0.00" },
          { header: "KDV %", key: "vatRate", width: 10, numFmt: "0.00" },
          { header: "KDV Tutar", key: "vatAmount", width: 14, numFmt: "#,##0.00" },
          { header: "Satir Toplam", key: "lineTotal", width: 16, numFmt: "#,##0.00" },
        ],
        rows,
      });
    } else {
      const rows = orders.map((o) => {
        const subtotal = Number(o.subtotal);
        const discount = Number(o.discountTotal);
        const vat = Number(o.vatTotal);
        const shipping = Number(o.shippingCost);
        const total = Number(o.total);
        const netExVat = Math.round((subtotal - discount - vat) * 100) / 100;
        return {
          orderNumber: o.orderNumber,
          date: o.createdAt.toLocaleDateString("tr-TR"),
          customer: o.user.name,
          email: o.user.email,
          dealer: o.user.dealer?.companyName ?? "",
          taxNumber: o.user.dealer?.taxNumber ?? "",
          payment: o.paymentMethod,
          status: o.status,
          subtotal,
          discount,
          vat,
          netExVat,
          shipping,
          total,
        };
      });
      const totalCiro = rows.reduce((s, r) => s + r.total, 0);
      buildBrandedSheet(wb, "Siparişler", {
        title: "Sipariş Ozeti",
        subtitle: `Tarih araligi: ${range}  ·  ${rows.length} sipariş  ·  Ciro: ${totalCiro.toFixed(2)} TL`,
        columns: [
          { header: "Sipariş No", key: "orderNumber", width: 18 },
          { header: "Tarih", key: "date", width: 14 },
          { header: "Musteri", key: "customer", width: 24 },
          { header: "Email", key: "email", width: 30 },
          { header: "Bayi", key: "dealer", width: 24 },
          { header: "Vergi No", key: "taxNumber", width: 14 },
          { header: "Ödeme", key: "payment", width: 14 },
          { header: "Durum", key: "status", width: 14 },
          { header: "Ara Toplam", key: "subtotal", width: 14, numFmt: "#,##0.00" },
          { header: "İskonto", key: "discount", width: 12, numFmt: "#,##0.00" },
          { header: "KDV", key: "vat", width: 12, numFmt: "#,##0.00" },
          { header: "Net (KDV Haric)", key: "netExVat", width: 16, numFmt: "#,##0.00" },
          { header: "Kargo", key: "shipping", width: 10, numFmt: "#,##0.00" },
          { header: "Toplam", key: "total", width: 14, numFmt: "#,##0.00" },
        ],
        rows,
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return excelResponse(buffer as ArrayBuffer, `${asciiKindLabel}-${stamp}.xlsx`, `${kindLabel}-${stamp}.xlsx`);
  }

  // CSV (legacy)
  const csv = type === "items" ? orderItemsToCsv(orders) : ordersToCsv(orders);
  const asciiFilename = `${asciiKindLabel}-${stamp}.csv`;
  const utf8Filename = `${kindLabel}-${stamp}.csv`;

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // RFC 5987: filename= (ASCII fallback) + filename*= (UTF-8) ile Turkce
      // karakterler modern tarayicilarda korunur, eski tarayicilar ASCII gorur.
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`,
    },
  });
  } catch (err) {
    // Bos response yerine acik bir hata kodu doner. Detay sunucu log'una;
    // production'da kullaniciya stack trace sizdirmiyoruz.
    console.error("[accounting/export] ERROR:", err);
    return NextResponse.json(
      { error: "Rapor olusturulamadi. Lütfen tekrar deneyin." },
      { status: 500 },
    );
  }
}
