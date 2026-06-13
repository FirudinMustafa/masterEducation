import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { returnProcessSchema, flattenZodError } from "@/lib/validations";
import { writeLedgerEntry } from "@/lib/ledger";
import { logAudit } from "@/lib/audit";

/**
 * Admin iade işleme — onay (APPROVE) veya red (REJECT).
 *
 * APPROVE yan etkileri (tek transaction):
 *  1. İade edilen ürünler stoğa geri eklenir.
 *  2. Açık hesap bayisiyse carisine RETURN_CREDIT alacağı yazılır (borç azalır).
 * REJECT yalnız durumu/notu günceller; stok/cari etkisi yoktur.
 *
 * Yalnız PENDING talepler işlenebilir (idempotent guard).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const json = await req.json().catch(() => ({}));
  const parsed = returnProcessSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { action, adminNote } = parsed.data;

  const ret = await prisma.return.findUnique({
    where: { id },
    include: {
      items: true,
      dealer: { select: { id: true, paymentTerms: true } },
      order: { select: { orderNumber: true } },
    },
  });
  if (!ret) {
    return NextResponse.json({ error: "İade talebi bulunamadı." }, { status: 404 });
  }
  if (ret.status !== "PENDING") {
    return NextResponse.json(
      { error: "Bu iade talebi zaten işlenmiş." },
      { status: 400 }
    );
  }

  if (action === "REJECT") {
    await prisma.return.update({
      where: { id },
      data: {
        status: "REJECTED",
        adminNote,
        processedBy: gate.session.user.id,
        processedAt: new Date(),
      },
    });
    logAudit({
      actorId: gate.session.user.id,
      action: "RETURN_REJECT",
      entityType: "return",
      entityId: id,
      metadata: { returnNumber: ret.returnNumber },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  // APPROVE — stok iadesi + (açık hesapsa) cari alacak, tek transaction.
  try {
    await prisma.$transaction(async (tx) => {
      for (const item of ret.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      }

      if (ret.dealer.paymentTerms === "OPEN_ACCOUNT") {
        await writeLedgerEntry(tx, {
          dealerId: ret.dealer.id,
          kind: "RETURN_CREDIT",
          // Negatif delta: bayinin borcunu azaltır (alacak).
          amount: -Number(ret.totalAmount),
          reference: ret.returnNumber,
          note: `İade: ${ret.returnNumber} (Sipariş ${ret.order.orderNumber})`,
          createdBy: gate.session.user.id,
        });
      }

      await tx.return.update({
        where: { id },
        data: {
          status: "APPROVED",
          adminNote,
          processedBy: gate.session.user.id,
          processedAt: new Date(),
        },
      });
    });
  } catch (err) {
    console.error("[returns/approve] failed", err);
    return NextResponse.json(
      { error: "İade onaylanırken bir hata oluştu." },
      { status: 500 }
    );
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "RETURN_APPROVE",
    entityType: "return",
    entityId: id,
    metadata: {
      returnNumber: ret.returnNumber,
      totalAmount: Number(ret.totalAmount),
      creditedLedger: ret.dealer.paymentTerms === "OPEN_ACCOUNT",
    },
  });

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
