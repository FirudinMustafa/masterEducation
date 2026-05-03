import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

const KIND_LABELS: Record<string, string> = {
  ORDER_DEBIT: "Siparis",
  ORDER_CANCEL_CREDIT: "Siparis Iptal (alacak)",
  PAYMENT_CREDIT: "Tahsilat",
  MANUAL_ADJUSTMENT: "Duzeltme",
};

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const dealerId = session.user.dealerId;
  const format = req.nextUrl.searchParams.get("format") ?? "xlsx";
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const where: { dealerId: string; createdAt?: { gte?: Date; lte?: Date } } = { dealerId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const [dealer, entries] = await Promise.all([
    prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { companyName: true, creditLimit: true, currentBalance: true },
    }),
    prisma.dealerLedger.findMany({
      where,
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!dealer) {
    return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });
  }

  const orderIds = entries.map((e) => e.orderId).filter((v): v is string => !!v);
  const orderMap = orderIds.length
    ? new Map(
        (
          await prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        ).map((o) => [o.id, o.orderNumber]),
      )
    : new Map<string, string>();

  const stamp = new Date().toISOString().slice(0, 10);
  const range = from || to ? `${from ?? "-"} → ${to ?? "-"}` : "Tum tarihler";

  logAudit({
    actorId: session.user.id,
    action: "DEALER_STATEMENT_EXPORT",
    entityType: "dealer",
    entityId: dealerId,
    metadata: { format, from: from ?? null, to: to ?? null, entryCount: entries.length },
  });

  const rows = entries.map((e) => {
    const amt = Number(e.amount);
    return {
      date: e.createdAt.toLocaleDateString("tr-TR"),
      kind: KIND_LABELS[e.kind] ?? e.kind,
      amount: amt,
      balanceAfter: Number(e.balanceAfter),
      orderNumber: e.orderId ? orderMap.get(e.orderId) ?? "" : "",
      reference: e.reference ?? "",
      note: e.note ?? "",
    };
  });

  const filenameBase = `ekstre-${dealer.companyName.replace(/[^a-zA-Z0-9]+/g, "_")}-${stamp}`;

  if (format === "csv") {
    const header = [
      "Tarih",
      "Islem",
      "Tutar",
      "Bakiye",
      "Siparis No",
      "Referans",
      "Not",
    ].join(";");
    const body = rows
      .map((r) =>
        [
          csvEscape(r.date),
          csvEscape(r.kind),
          csvEscape(r.amount.toFixed(2)),
          csvEscape(r.balanceAfter.toFixed(2)),
          csvEscape(r.orderNumber),
          csvEscape(r.reference),
          csvEscape(r.note),
        ].join(";"),
      )
      .join("\n");
    return new NextResponse("﻿" + header + "\n" + body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  const wb = createBrandedWorkbook();
  buildBrandedSheet(wb, "Ekstre", {
    title: "Cari Ekstre",
    subtitle: `${dealer.companyName}  ·  ${range}  ·  ${rows.length} hareket  ·  Bakiye: ${Number(dealer.currentBalance).toFixed(2)} TL`,
    intro: "Kredi limiti ve guncel bakiye Master Education kayitlari ile mutabiktir. Itiraz icin: info@mastereducation.com.tr",
    columns: [
      { header: "Tarih", key: "date", width: 14 },
      { header: "Islem", key: "kind", width: 22 },
      { header: "Tutar", key: "amount", width: 14, numFmt: "#,##0.00" },
      { header: "Bakiye", key: "balanceAfter", width: 14, numFmt: "#,##0.00" },
      { header: "Siparis No", key: "orderNumber", width: 18 },
      { header: "Referans", key: "reference", width: 20 },
      { header: "Not", key: "note", width: 30 },
    ],
    rows,
  });

  const buffer = await wb.xlsx.writeBuffer();
  return excelResponse(buffer as ArrayBuffer, `${filenameBase}.xlsx`);
}
