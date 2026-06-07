import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Ödeme Başarısız",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ orderId?: string }>;
}

export default async function PaymentFailurePage({ searchParams }: PageProps) {
  const { orderId } = await searchParams;

  const order = orderId
    ? await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true, status: true },
      })
    : null;

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-14">
      <div className="text-center mb-6">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
          Ödeme tamamlanamadi
        </h1>
        {order ? (
          <p className="text-sm text-brand-muted">
            <span className="font-mono">{order.orderNumber}</span> numarali
            sipariş iptal edildi ve stoklariniz iade edildi.
          </p>
        ) : (
          <p className="text-sm text-brand-muted">
            Ödeme akisi tamamlanamadi.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm space-y-2 mb-6">
        <p className="font-semibold text-brand-black">Ne yapabilirsiniz?</p>
        <ul className="list-disc list-inside text-brand-muted space-y-1">
          <li>Sepete geri donup yeni bir ödeme deneyin.</li>
          <li>
            Kart bilgilerinin dogru girildiginden ve bankanizin 3D Secure
            şifresini kullandiginizdan emin olun.
          </li>
          <li>
            Sorun devam ederse{" "}
            <Link
              href="/iletisim"
              className="text-brand-gold-dark hover:underline font-medium"
            >
              bize ulasin
            </Link>
            , size yardimci olalim.
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/sepet"
          className="px-5 py-2.5 bg-brand-gold text-brand-black rounded-lg font-semibold hover:bg-brand-gold-dark"
        >
          Sepete Don
        </Link>
        <Link
          href="/urunler"
          className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
        >
          Ürünlere Don
        </Link>
      </div>
    </div>
  );
}
