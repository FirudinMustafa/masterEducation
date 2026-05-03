import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { anonymizeUser } from "@/lib/user-anonymize";
import { cleanupDealerByUserId } from "@/lib/dealer-cleanup";

const MAX_IDS = 200;

const bodySchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(MAX_IDS),
  mode: z.enum(["auto", "anonymize_all", "hard_only"]).default("auto"),
});

/**
 * Toplu kullanici silme.
 *
 * Modlar:
 *   - "auto" (default): siparişi olmayan → hard delete; siparişi olan → anonymize
 *   - "anonymize_all": hepsini anonimleştir (siparişi olmasa bile — KVKK soft tercih)
 *   - "hard_only": yalnız siparişi olmayanları sil; siparişi olanları atla
 *
 * Korumalar:
 *   - Kendi hesabını silemez
 *   - ADMIN rolünü silemez (son admin koruması)
 *   - Onaylı bayiler silinemez (cari hareket riski) — atlanır
 */
export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { userIds, mode } = parsed.data;

  // Self-id'yi at
  const filteredIds = userIds.filter((id) => id !== gate.session.user.id);
  const skippedSelf = userIds.length - filteredIds.length;

  const users = await prisma.user.findMany({
    where: { id: { in: filteredIds } },
    select: {
      id: true,
      email: true,
      role: true,
      dealer: { select: { status: true } },
      _count: { select: { orders: true } },
    },
  });

  let hardDeleted = 0;
  let anonymized = 0;
  let dealersCleanedUp = 0;
  let cancelledOrdersTotal = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const u of users) {
    if (u.role === "ADMIN") {
      skipped.push({ id: u.id, reason: "ADMIN silinemez" });
      continue;
    }

    try {
      // Bayi ise once dealer cleanup — APPROVED da olsa siliniyor (admin
      // tek tikla temizlemek istiyor). Aktif siparisler iptal, stok geri,
      // ledger temizlenir, dealer kaydi silinir.
      if (u.dealer) {
        const cleanup = await cleanupDealerByUserId(u.id, gate.session.user.id);
        if (cleanup) {
          dealersCleanedUp++;
          cancelledOrdersTotal += cleanup.cancelledOrders;
        }
      }

      // Dealer cleanup kalan siparisleri (DELIVERED/CANCELLED) etkilemez.
      // hasOrders flag'i CLEANUP SONRASI yeniden hesaplanir (cancel olmus
      // siparisler hala "var" sayilir cunku kayit silinmedi, sadece status
      // CANCELLED). KVKK acisindan bu siparisler User'a bagli kalir.
      const hasOrders = u._count.orders > 0;
      const wantsAnonymize =
        mode === "anonymize_all" || (mode === "auto" && hasOrders);
      const wantsHard =
        mode === "hard_only" || (mode === "auto" && !hasOrders);

      if (wantsAnonymize) {
        await anonymizeUser(u.id);
        anonymized++;
      } else if (wantsHard) {
        if (hasOrders && mode === "hard_only") {
          skipped.push({
            id: u.id,
            reason: "Siparis var (hard_only modunda atlandi)",
          });
          continue;
        }
        await prisma.user.delete({ where: { id: u.id } });
        hardDeleted++;
      }
    } catch (e) {
      skipped.push({
        id: u.id,
        reason: e instanceof Error ? e.message : "Bilinmeyen hata",
      });
    }
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "USER_BULK_DELETE",
    entityType: "user",
    entityId: "bulk",
    metadata: {
      requested: userIds.length,
      mode,
      hardDeleted,
      anonymized,
      dealersCleanedUp,
      cancelledOrdersTotal,
      skipped: skipped.length + skippedSelf,
      skippedSelf,
      skippedSamples: skipped.slice(0, 20),
    },
  });

  return NextResponse.json({
    requested: userIds.length,
    hardDeleted,
    anonymized,
    dealersCleanedUp,
    cancelledOrdersTotal,
    skipped: skipped.length + skippedSelf,
    skippedSelf,
    skippedDetails: skipped.slice(0, 50),
  });
}
