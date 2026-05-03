import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { anonymizeUser } from "@/lib/user-anonymize";
import { cleanupDealerByUserId } from "@/lib/dealer-cleanup";

/**
 * DELETE /api/admin/users/[id]
 *
 * Davranis:
 *   - Siparisi yoksa → hard delete (cascade)
 *   - Siparisi varsa + `?mode=anonymize` → kisisel veri silinir, satir korunur
 *   - Siparisi varsa + mode yoksa → 409, UI anonymize seçeneği sunar
 *
 * Korumalar:
 *   - Kendi hesabini silemez
 *   - Son admin silinemez
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  if (id === gate.session.user.id) {
    return NextResponse.json(
      { error: "Kendi hesabinizi silemezsiniz." },
      { status: 400 }
    );
  }

  const mode = req.nextUrl.searchParams.get("mode");
  const wantsAnonymize = mode === "anonymize";

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      email: true,
      dealer: { select: { id: true, companyName: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Son admin hesabini silemezsiniz." },
        { status: 400 }
      );
    }
  }

  // Bayi ise once dealer cleanup (aktif siparisleri iptal et, stok geri,
  // ledger/iskonto/belge sil, dealer kaydini sil). Sonra User akisina devam.
  let dealerCleanup: Awaited<ReturnType<typeof cleanupDealerByUserId>> = null;
  if (user.dealer) {
    dealerCleanup = await cleanupDealerByUserId(id, gate.session.user.id);
  }

  const orderCount = await prisma.order.count({ where: { userId: id } });

  if (orderCount > 0 && !wantsAnonymize) {
    return NextResponse.json(
      {
        error: `Bu kullanicinin ${orderCount} siparisi var. Tam silme mumkun degil — anonimlestirme akisini kullanin.`,
        canAnonymize: true,
        orderCount,
        dealerCleanup,
      },
      { status: 409 }
    );
  }

  // Audit metadata icin diz: nested obje yerine duz alanlar (Prisma.InputJsonValue
  // index signature istiyor; DealerCleanupResult ozel tip).
  const cleanupMeta = dealerCleanup
    ? {
        dealerCleaned: true,
        cancelledOrders: dealerCleanup.cancelledOrders,
        ledgerEntriesPurged: dealerCleanup.ledgerEntriesPurged,
        documentsPurged: dealerCleanup.documentsPurged,
        discountRulesPurged: dealerCleanup.discountRulesPurged,
        previousBalance: dealerCleanup.previousBalance,
      }
    : { dealerCleaned: false };

  if (wantsAnonymize) {
    const { originalEmail } = await anonymizeUser(id);
    logAudit({
      actorId: gate.session.user.id,
      action: "USER_ADMIN_DELETE",
      entityType: "user",
      entityId: id,
      metadata: {
        strategy: "anonymize",
        orderCount,
        originalEmail,
        previousRole: user.role,
        ...cleanupMeta,
      },
    });
    return NextResponse.json({ ok: true, strategy: "anonymize", dealerCleanup });
  }

  // Siparis yok → hard delete (cascade). Dealer kaydi varsa zaten yukarida silindi.
  await prisma.user.delete({ where: { id } });

  logAudit({
    actorId: gate.session.user.id,
    action: "USER_ADMIN_DELETE",
    entityType: "user",
    entityId: id,
    metadata: {
      strategy: "hard",
      email: user.email,
      previousRole: user.role,
      ...cleanupMeta,
    },
  });

  return NextResponse.json({ ok: true, strategy: "hard", dealerCleanup });
}
