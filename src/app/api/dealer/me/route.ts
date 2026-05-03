import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Current dealer info — checkout/sidebar gibi yerlerin bakiye + limit'i
 * fresh okumasi icin. Yalniz oturum acik DEALER kullanicisi cagirir.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER") {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      companyName: true,
      status: true,
      paymentTerms: true,
      creditLimit: true,
      currentBalance: true,
    },
  });

  if (!dealer) return NextResponse.json({ error: "Bayi bulunamadi." }, { status: 404 });

  return NextResponse.json({
    id: dealer.id,
    companyName: dealer.companyName,
    status: dealer.status,
    paymentTerms: dealer.paymentTerms,
    creditLimit: Number(dealer.creditLimit),
    currentBalance: Number(dealer.currentBalance),
    remaining: Math.max(0, Number(dealer.creditLimit) - Number(dealer.currentBalance)),
  });
}
