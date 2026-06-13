import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/**
 * Admin sidebar bildirim rozetleri için hafif sayım endpoint'i.
 * Bekleyen sipariş ("Gelen Sipariş" kovası = PENDING + APPROVED) ve bekleyen
 * bayi başvurusu (PENDING) sayıları. Sidebar client component bunu periyodik /
 * route değişiminde çeker.
 */
export async function GET() {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const [pendingOrders, pendingDealers, pendingReturns] = await Promise.all([
    prisma.order.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.dealer.count({ where: { status: "PENDING" } }),
    prisma.return.count({ where: { status: "PENDING" } }),
  ]);

  return NextResponse.json(
    { pendingOrders, pendingDealers, pendingReturns },
    { headers: { "Cache-Control": "no-store" } },
  );
}
