import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Sipariş Takibi",
  description: "Sipariş numaraniz ve email adresiniz ile sipariş durumunuzu sorgulayin.",
};

interface PageProps {
  searchParams: Promise<{ no?: string; email?: string }>;
}

export default async function OrderTrackPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const orderNumber = (sp.no ?? "").trim();
  const email = (sp.email ?? "").trim().toLowerCase();

  let order:
    | {
        id: string;
        orderNumber: string;
        status: string;
        trackingNumber: string | null;
        total: number;
        createdAt: Date;
        shippingName: string;
        shippingCity: string;
      }
    | null = null;
  let error: string | null = null;

  if (orderNumber && email) {
    const found = await prisma.order.findFirst({
      where: {
        orderNumber,
        user: { email },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        trackingNumber: true,
        total: true,
        createdAt: true,
        shippingName: true,
        shippingCity: true,
      },
    });
    if (!found) {
      error =
        "Sorguladiginiz sipariş bulunamadi. Lütfen sipariş numaranizi ve email adresinizi kontrol edin.";
    } else {
      order = {
        ...found,
        total: Number(found.total),
      };
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-display font-bold text-brand-black mb-2">
        Sipariş Takibi
      </h1>
      <p className="text-sm text-brand-muted mb-6">
        Giriş yapmadan, sipariş numaraniz ve email adresiniz ile sipariş
        durumunuzu sorgulayabilirsiniz.
      </p>

      <form
        method="get"
        className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
      >
        <label className="block">
          <span className="block text-sm font-medium text-brand-black mb-1">
            Sipariş Numarasi
          </span>
          <input
            name="no"
            defaultValue={orderNumber}
            placeholder="ME-20260422-0001"
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-brand-black mb-1">
            Email
          </span>
          <input
            type="email"
            name="email"
            defaultValue={email}
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full py-2.5 bg-brand-gold text-brand-black font-semibold rounded-lg hover:bg-brand-gold-dark"
        >
          Sorgula
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {order && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Sipariş No</p>
              <p className="font-mono font-semibold text-brand-black">
                {order.orderNumber}
              </p>
            </div>
            <span className="inline-flex px-3 py-1 text-sm font-medium rounded-full bg-amber-100 text-amber-700">
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">Tarih</dt>
            <dd className="text-right">
              {new Date(order.createdAt).toLocaleDateString("tr-TR")}
            </dd>
            <dt className="text-gray-500">Alici</dt>
            <dd className="text-right">{order.shippingName}</dd>
            <dt className="text-gray-500">Şehir</dt>
            <dd className="text-right">{order.shippingCity}</dd>
          </dl>
          {order.trackingNumber && (
            <div className="pt-3 border-t border-gray-100 text-sm flex items-center justify-between">
              <span>
                <span className="text-gray-500">Kargo Takip: </span>
                <span className="font-mono">{order.trackingNumber}</span>
              </span>
              <Link
                href={`/kargo-takip/${order.trackingNumber}`}
                className="text-brand-gold-dark hover:underline font-medium"
              >
                Detay &rarr;
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
