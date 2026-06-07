import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { OrderCard, type OrderCardData } from "./order-card";
import { ChevronLeftIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Siparişlerim" };

export default async function MyOrdersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/giris");
  }

  const userId = session.user.id;

  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Decimal/number normalize
  const data: OrderCardData[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    subtotal: Number(o.subtotal),
    discountTotal: Number(o.discountTotal),
    couponCode: o.couponCode,
    couponDiscount: Number(o.couponDiscount),
    vatTotal: Number(o.vatTotal),
    shippingCost: Number(o.shippingCost),
    total: Number(o.total),
    trackingNumber: o.trackingNumber,
    trackingCarrier: o.trackingCarrier,
    shippingName: o.shippingName,
    shippingAddress: o.shippingAddress,
    shippingCity: o.shippingCity,
    shippingPhone: o.shippingPhone,
    createdAt: o.createdAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    estimatedDeliveryAt: o.estimatedDeliveryAt,
    note: o.note,
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productName,
      productSku: i.productSku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.lineTotal),
      vatRate: Number(i.vatRate),
      vatAmount: Number(i.vatAmount),
      discountPct: Number(i.discountPct),
    })),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Compact header */}
      <div className="mb-5 flex items-center gap-2">
        <Link
          href="/hesabim"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Hesabım'a don"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-neutral-950 sm:text-2xl">
            Siparişlerim
          </h1>
          <p className="text-[12px] text-neutral-500">
            {data.length === 0
              ? "Henuz siparişiniz yok"
              : `Toplam ${data.length} sipariş`}
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
            <svg
              className="h-8 w-8 text-neutral-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z"
              />
            </svg>
          </div>
          <p className="text-sm text-neutral-500">Henuz siparişiniz bulunmamaktadir.</p>
          <Link
            href="/urunler"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            Alisverise Basla
          </Link>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {data.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
