import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Siparislerim - Bayi Paneli" };

export default async function DealerOrdersPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;

  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      items: {
        include: { product: { select: { name: true } } },
      },
      // Son 3 OrderEvent — admin'in yazdığı notları timeline gibi gösteririz
      events: {
        where: { note: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-brand-black mb-6">Siparislerim</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Henuz siparissiniz bulunmamaktadir.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Order header */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Siparis No</p>
                    <p className="font-semibold text-brand-black">{order.orderNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tarih</p>
                    <p className="text-sm">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                    order.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                    order.status === "APPROVED" ? "bg-blue-100 text-blue-700" :
                    order.status === "SHIPPED" ? "bg-purple-100 text-purple-700" :
                    order.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                    order.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                  <p className="font-bold text-brand-black">{formatPrice(Number(order.total))}</p>
                </div>
              </div>

              {/* Order items */}
              <div className="p-4">
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">{item.quantity}x</span>
                        <span className="text-brand-black">{item.productName}</span>
                      </div>
                      <span className="font-medium">{formatPrice(Number(item.lineTotal))}</span>
                    </div>
                  ))}
                </div>

                {/* Admin notlarini gosterilen son 3 OrderEvent'tan oku */}
                {order.events.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Yonetimden Notlar
                    </p>
                    <ul className="space-y-2">
                      {order.events.map((ev) => (
                        <li
                          key={ev.id}
                          className="flex gap-3 rounded-lg border-l-2 border-brand-gold bg-amber-50/50 p-2.5 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-neutral-800">{ev.note}</p>
                            <p className="mt-1 text-[11px] text-neutral-500">
                              {new Date(ev.createdAt).toLocaleString("tr-TR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {order.trackingNumber && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm flex items-center justify-between flex-wrap gap-2">
                    <span>
                      <span className="text-gray-500">Kargo Takip: </span>
                      <span className="font-medium font-mono">
                        {order.trackingNumber}
                      </span>
                    </span>
                    <Link
                      href={`/kargo-takip/${order.trackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-gold-dark hover:underline font-medium"
                    >
                      Kargoyu takip et &rarr;
                    </Link>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <a
                    href={`/api/orders/${order.id}/pdf`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-gold-dark hover:underline"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Siparis PDF&apos;i
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
