import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { mockPaymentsEnabled } from "@/lib/env";
import { ThreeDSecureForm } from "./three-d-secure-form";

export const metadata: Metadata = {
  title: "3D Secure Odeme",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ThreeDSecurePage({ params }: PageProps) {
  if (!mockPaymentsEnabled()) notFound();
  const { token } = await params;

  const ps = await prisma.paymentSession.findUnique({
    where: { token },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          shippingName: true,
        },
      },
    },
  });

  if (!ps) notFound();

  const expired = ps.expiresAt < new Date();

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              3D Secure Dogrulama
            </p>
            <h1 className="text-xl font-display font-bold text-brand-black">
              Kart Dogrulama
            </h1>
          </div>
          <div className="text-right text-xs text-gray-400">
            <p>Mock PSP</p>
            <p>SSL korumali</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Siparis No</span>
            <span className="font-mono">{ps.order.orderNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Kart</span>
            <span className="font-mono">
              {ps.cardBrand ?? "KART"} **** {ps.cardLastFour ?? "????"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Tutar</span>
            <span className="font-semibold text-brand-black">
              {formatPrice(Number(ps.amount))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ad</span>
            <span>{ps.order.shippingName}</span>
          </div>
        </div>

        {ps.status !== "PENDING" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Bu odeme oturumu zaten <strong>{ps.status}</strong> durumunda.
          </div>
        ) : expired ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Odeme oturumu suresi dolmus. Siparisi iptal edip yeniden baslatmaniz
            gerekiyor.
          </div>
        ) : (
          <ThreeDSecureForm token={token} orderId={ps.orderId} />
        )}
      </div>

      <p className="text-center text-xs text-gray-400 mt-4">
        Bu bir mock 3D Secure ekranidir. Gercek PSP entegrasyonu icin Iyzico /
        PayTR / Craftgate planlaniyor.
      </p>
    </div>
  );
}
