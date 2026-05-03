import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export async function requireRole(role: UserRole) {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }),
    };
  }
  if (session.user.role !== role) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Yetkisiz." }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

/**
 * Bayi tarafi endpoint'leri icin: oturum DEALER mi + status APPROVED mi?
 * SUSPENDED/REJECTED/PENDING bayi siparis veremez, panel API'lerini kullanamaz.
 *
 * JWT'deki dealerStatus stale olabilir (admin az once SUSPEND etti),
 * o yuzden DB'den FRESH okuyoruz. Bu kritik — askiya alindiktan sonra istek
 * atan bayi 403 gormeli.
 */
export async function requireApprovedDealer() {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }),
    };
  }
  if (session.user.role !== "DEALER") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Yetkisiz." }, { status: 403 }),
    };
  }
  const dealer = await prisma.dealer.findUnique({
    where: { userId: session.user.id },
    select: { id: true, status: true, paymentTerms: true },
  });
  if (!dealer) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Bayi kaydi bulunamadi." },
        { status: 403 }
      ),
    };
  }
  if (dealer.status !== "APPROVED") {
    const reason =
      dealer.status === "SUSPENDED"
        ? "Hesabiniz askiya alinmis. Lutfen bizimle iletisime gecin."
        : dealer.status === "REJECTED"
          ? "Bayi basvurunuz reddedilmis."
          : "Bayi basvurunuz henuz onaylanmadi.";
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: reason, dealerStatus: dealer.status },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, session, dealer };
}
