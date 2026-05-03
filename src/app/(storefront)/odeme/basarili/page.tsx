import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Odeme Basarili",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ orderId?: string }>;
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const { orderId } = await searchParams;

  const order = orderId
    ? await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          total: true,
          paymentMethod: true,
          status: true,
          shippingName: true,
          shippingCity: true,
          user: { select: { email: true } },
        },
      })
    : null;

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-14">
      <div className="text-center mb-8">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
          Odemeniz onaylandi
        </h1>
        <p className="text-sm text-brand-muted">
          Siparisinizi aldik. Onay detaylari asagida.
        </p>
      </div>

      {order && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 mb-6">
          <div className="flex justify-between items-center pb-3 border-b border-gray-100">
            <span className="text-xs uppercase tracking-wider text-gray-500">
              Siparis No
            </span>
            <span className="font-mono font-semibold text-brand-black">
              {order.orderNumber}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tutar</span>
            <span className="font-semibold">
              {formatPrice(Number(order.total))}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Odeme</span>
            <span>
              {order.paymentMethod === "CREDIT_CARD" ? "Kredi Karti" : "Acik Hesap"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Teslim</span>
            <span className="text-right">
              {order.shippingName} · {order.shippingCity}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-brand-gold-light bg-amber-50/60 p-4 text-sm space-y-2 mb-6">
        <p className="font-semibold text-brand-black">Siradaki adimlar</p>
        <ul className="space-y-1.5 text-brand-muted">
          <li className="flex gap-2">
            <span className="text-brand-gold-dark">1.</span>
            <span>
              Siparis detaylari{" "}
              {order?.user?.email ? (
                <strong>{order.user.email}</strong>
              ) : (
                "email adresinize"
              )}{" "}
              gonderildi.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-gold-dark">2.</span>
            <span>
              Siparisiniz 1-2 is gunu icinde hazirlanip kargoya verilecektir.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-gold-dark">3.</span>
            <span>
              Kargo takip numarasi hazir olunca{" "}
              <Link
                href="/hesabim/siparislerim"
                className="text-brand-gold-dark hover:underline font-medium"
              >
                Siparislerim
              </Link>{" "}
              sayfasinda ve email&apos;de gorebilirsiniz.
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/urunler"
          className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
        >
          Alisverise Devam Et
        </Link>
        <Link
          href="/hesabim/siparislerim"
          className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
        >
          Siparislerimi Gor
        </Link>
      </div>
    </div>
  );
}
