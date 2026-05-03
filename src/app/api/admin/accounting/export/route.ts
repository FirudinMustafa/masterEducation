import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { ordersToCsv, orderItemsToCsv } from "@/lib/adapters/accounting";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

export async function GET(req: NextRequest) {
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

  const stamp = new Date().toISOString().slice(0, 10);
  const kindLabel = type === "items" ? "siparis-satirlari" : "siparisler";

  if (format === "xlsx") {
    const wb = createBrandedWorkbook();
    const range = from || to ? `${from ?? "-"} → ${to ?? "-"}` : "Tum tarihler";

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
      buildBrandedSheet(wb, "Siparis Satirlari", {
        title: "Siparis Satirlari Raporu",
        subtitle: `Tarih araligi: ${range}  ·  ${rows.length} satir`,
        columns: [
          { header: "Siparis No", key: "orderNumber", width: 18 },
          { header: "Tarih", key: "date", width: 14 },
          { header: "ISBN", key: "sku", width: 18 },
          { header: "Urun", key: "product", width: 40 },
          { header: "Adet", key: "quantity", width: 8, numFmt: "0" },
          { header: "Birim Fiyat", key: "unitPrice", width: 14, numFmt: "#,##0.00" },
          { header: "Iskonto %", key: "discountPct", width: 12, numFmt: "0.00" },
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
      buildBrandedSheet(wb, "Siparisler", {
        title: "Siparis Ozeti",
        subtitle: `Tarih araligi: ${range}  ·  ${rows.length} siparis  ·  Ciro: ${totalCiro.toFixed(2)} TL`,
        columns: [
          { header: "Siparis No", key: "orderNumber", width: 18 },
          { header: "Tarih", key: "date", width: 14 },
          { header: "Musteri", key: "customer", width: 24 },
          { header: "Email", key: "email", width: 30 },
          { header: "Bayi", key: "dealer", width: 24 },
          { header: "Vergi No", key: "taxNumber", width: 14 },
          { header: "Odeme", key: "payment", width: 14 },
          { header: "Durum", key: "status", width: 14 },
          { header: "Ara Toplam", key: "subtotal", width: 14, numFmt: "#,##0.00" },
          { header: "Iskonto", key: "discount", width: 12, numFmt: "#,##0.00" },
          { header: "KDV", key: "vat", width: 12, numFmt: "#,##0.00" },
          { header: "Net (KDV Haric)", key: "netExVat", width: 16, numFmt: "#,##0.00" },
          { header: "Kargo", key: "shipping", width: 10, numFmt: "#,##0.00" },
          { header: "Toplam", key: "total", width: 14, numFmt: "#,##0.00" },
        ],
        rows,
      });
    }

    const buffer = await wb.xlsx.writeBuffer();
    return excelResponse(buffer as ArrayBuffer, `${kindLabel}-${stamp}.xlsx`);
  }

  // CSV (legacy)
  const csv = type === "items" ? orderItemsToCsv(orders) : ordersToCsv(orders);
  const filename = `${kindLabel}-${stamp}.csv`;

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
