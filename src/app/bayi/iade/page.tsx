import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { formatPrice } from "@/lib/utils";
import { DealerReturnForm } from "@/components/bayi/dealer-return-form";

export const metadata: Metadata = { title: "İadelerim - Bayi Paneli" };

const RETURN_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Beklemede", cls: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Onaylandı", cls: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "Reddedildi", cls: "bg-rose-100 text-rose-700" },
};

export default async function DealerReturnsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;
  const dealerId = session.user.dealerId;
  if (!dealerId) return null;

  const [returns, deliveredOrders] = await Promise.all([
    prisma.return.findMany({
      where: { dealerId },
      include: {
        items: true,
        order: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // İade yalnız teslim edilmiş (Tamamlandı) siparişlerden.
    prisma.order.findMany({
      where: { userId, status: "DELIVERED" },
      include: {
        items: {
          select: {
            id: true,
            productName: true,
            productSku: true,
            quantity: true,
            unitPrice: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const formOrders = deliveredOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    items: o.items.map((it) => ({
      id: it.id,
      productName: it.productName,
      productSku: it.productSku,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
    })),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">İadelerim</h1>
        <p className="text-sm text-gray-500 mt-1">
          Teslim aldığınız siparişlerdeki ürünler için iade talebi oluşturun. Talebiniz
          yönetim onayından sonra işleme alınır.
        </p>
      </div>

      <DealerReturnForm orders={formOrders} />

      <div>
        <h2 className="font-semibold text-brand-black mb-3">İade Taleplerim</h2>
        {returns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            Henüz iade talebiniz bulunmuyor.
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map((r) => {
              const st = RETURN_STATUS[r.status] ?? RETURN_STATUS.PENDING;
              return (
                <div
                  key={r.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-gray-50 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-gray-500">İade No</p>
                        <p className="font-semibold text-brand-black">{r.returnNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sipariş</p>
                        <p className="text-sm">{r.order.orderNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Tarih</p>
                        <p className="text-sm">
                          {new Date(r.createdAt).toLocaleDateString("tr-TR")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-brand-black">
                        {formatPrice(Number(r.totalAmount))}
                      </span>
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 space-y-1.5">
                    {r.items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">{it.quantity}x</span>
                        <span className="text-brand-black">{it.productName}</span>
                      </div>
                    ))}
                    {r.reason && (
                      <p className="mt-2 text-xs text-gray-500">
                        Sebep: <span className="text-gray-700">{r.reason}</span>
                      </p>
                    )}
                    {r.adminNote && (
                      <p className="mt-1 text-xs text-gray-500">
                        Yönetim notu: <span className="text-gray-700">{r.adminNote}</span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
