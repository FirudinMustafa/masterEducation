import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import Link from "next/link";

export default async function DealerDashboardPage() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = session.user.id;
  const dealerId = session.user.dealerId;
  if (!dealerId) return null;

  const [dealer, orders, recentOrders] = await Promise.all([
    prisma.dealer.findUnique({ where: { id: dealerId } }),
    prisma.order.findMany({
      where: { userId },
      select: { total: true, status: true },
    }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { items: { select: { id: true } } },
    }),
  ]);

  // İptal edilen siparişler "harcama" değildir — ödenmemiş veya iade edilmiş.
  // Toplam harcama hesabında CANCELLED'ı tamamen dışla.
  const activeOrders = orders.filter((o) => o.status !== "CANCELLED");
  const totalSpent = activeOrders.reduce((sum, o) => sum + Number(o.total), 0);

  const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
  const deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;
  const cancelledOrders = orders.filter((o) => o.status === "CANCELLED").length;
  // "Yolda" — onaylanmış ama henüz teslim olmamış aktif siparişler
  const inFlightOrders = orders.filter((o) =>
    ["APPROVED", "PROCESSING", "SHIPPED"].includes(o.status)
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Hos geldiniz, {session.user!.name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {dealer?.companyName} - Bayi Paneli
        </p>
      </div>

      {/* Stats — CANCELLED siparisleri harcama hesabindan disladik */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Toplam Siparis</p>
          <p className="text-2xl font-bold text-brand-black mt-1">{activeOrders.length}</p>
          {cancelledOrders > 0 && (
            <p className="mt-1 text-[11px] text-rose-600">
              + {cancelledOrders} iptal (harcamaya dahil degil)
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Yolda / Hazirlanan</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{inFlightOrders}</p>
          {pendingOrders > 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              {pendingOrders} onay bekliyor
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Teslim Edilen</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{deliveredOrders}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Toplam Harcama</p>
          <p className="text-2xl font-bold text-brand-black mt-1">{formatPrice(totalSpent)}</p>
          <p className="mt-1 text-[11px] text-gray-400">Iptal edilenler haric</p>
        </div>
      </div>

      {/* Dealer info */}
      {dealer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-brand-black mb-3">Firma Bilgileri</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Firma Adi</span>
                <span className="font-medium">{dealer.companyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vergi Dairesi</span>
                <span className="font-medium">{dealer.taxOffice}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Vergi No</span>
                <span className="font-medium font-mono">{dealer.taxNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Odeme Modu</span>
                <span className="font-medium">
                  {dealer.paymentTerms === "PREPAID"
                    ? "Pesin (Kredi Karti / Havale)"
                    : "Cari Hesap"}
                </span>
              </div>
              {dealer.paymentTerms === "OPEN_ACCOUNT" && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kredi Limiti</span>
                    <span className="font-medium">{formatPrice(Number(dealer.creditLimit))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cari Bakiye</span>
                    <span className="font-medium">{formatPrice(Number(dealer.currentBalance))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kullanilabilir</span>
                    <span className="font-medium text-green-700">
                      {formatPrice(
                        Number(dealer.creditLimit) - Number(dealer.currentBalance)
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-brand-black mb-3">Hizli Islemler</h2>
            <div className="space-y-2">
              <Link
                href="/urunler"
                className="flex items-center gap-3 p-3 rounded-lg bg-brand-gold-light/30 hover:bg-brand-gold-light/50 transition-colors"
              >
                <svg className="w-5 h-5 text-brand-gold-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-brand-black">Alisveris Yap</p>
                  <p className="text-xs text-gray-500">Bayi fiyatlariyla urunlere goz atin</p>
                </div>
              </Link>
              <Link
                href="/bayi/siparisler"
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-brand-black">Siparislerimi Gor</p>
                  <p className="text-xs text-gray-500">Tum siparislerinizi takip edin</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-brand-black">Son Siparisler</h2>
          <Link href="/bayi/siparisler" className="text-sm text-brand-gold-dark hover:underline font-medium">
            Tumu &rarr;
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Henuz siparissiniz yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Siparis No</th>
                  <th className="text-center p-3 text-xs font-semibold text-gray-500 uppercase">Urun</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-3 font-medium text-brand-black">{order.orderNumber}</td>
                    <td className="p-3 text-center text-gray-600">{order.items.length}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        order.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                        order.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{formatPrice(Number(order.total))}</td>
                    <td className="p-3 text-right text-gray-500 text-xs">
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
