import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";

/**
 * Admin sidebar bildirim rozetleri için hafif sayım endpoint'i.
 * Bekleyen sipariş (PENDING) ve bekleyen bayi başvurusu (PENDING) sayıları.
 * Sidebar client component bunu periyodik / route değişiminde çeker.
 */
export async function GET() {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const [pendingOrders, pendingDealers] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.dealer.count({ where: { status: "PENDING" } }),
  ]);

  return NextResponse.json(
    { pendingOrders, pendingDealers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
