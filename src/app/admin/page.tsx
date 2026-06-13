import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import Link from "next/link";

const LOW_STOCK_THRESHOLD = 5;

async function getStats() {
  const [
    totalProducts,
    totalOrders,
    pendingOrders,
    totalDealers,
    pendingDealers,
    recentOrders,
    lowStockProducts,
    outOfStockCount,
  ] = await Promise.all([
    prisma.product.count({ where: { isPublished: true } }),
    prisma.order.count(),
    // "Gelen Sipariş" kovası (PENDING + APPROVED).
    prisma.order.count({ where: { status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.dealer.count(),
    prisma.dealer.count({ where: { status: "PENDING" } }),
    prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.product.findMany({
      where: {
        isPublished: true,
        stockQuantity: { gt: 0, lte: LOW_STOCK_THRESHOLD },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
      },
      orderBy: { stockQuantity: "asc" },
      take: 10,
    }),
    prisma.product.count({
      where: { isPublished: true, stockQuantity: { lte: 0 } },
    }),
  ]);

  // Revenue
  const orders = await prisma.order.findMany({
    where: { paymentStatus: "PAID" },
    select: { total: true },
  });
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

  return {
    totalProducts,
    totalOrders,
    pendingOrders,
    totalDealers,
    pendingDealers,
    totalRevenue,
    recentOrders,
    lowStockProducts,
    outOfStockCount,
  };
}

export default async function AdminDashboardPage() {
  const stats = await getStats();

  const statCards = [
    {
      label: "Toplam Ürün",
      value: stats.totalProducts.toLocaleString("tr-TR"),
      color: "bg-blue-50 text-blue-700",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
        </svg>
      ),
      href: "/admin/urunler",
    },
    {
      label: "Toplam Sipariş",
      value: stats.totalOrders.toLocaleString("tr-TR"),
      sub: stats.pendingOrders > 0 ? `${stats.pendingOrders} bekleyen` : undefined,
      color: "bg-green-50 text-green-700",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      ),
      href: "/admin/siparisler",
    },
    {
      label: "Ciro",
      value: formatPrice(stats.totalRevenue),
      color: "bg-amber-50 text-amber-700",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
      href: "/admin/siparisler",
    },
    {
      label: "Bayiler",
      value: stats.totalDealers.toString(),
      sub: stats.pendingDealers > 0 ? `${stats.pendingDealers} bekleyen` : undefined,
      color: "bg-purple-50 text-purple-700",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
        </svg>
      ),
      href: "/admin/bayiler",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-brand-black mb-6">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2.5 rounded-lg ${card.color}`}>{card.icon}</div>
            </div>
            <p className="text-2xl font-bold text-brand-black">{card.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            {card.sub && (
              <p className="text-xs text-amber-600 font-medium mt-1">{card.sub}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Low Stock Alert */}
      {(stats.lowStockProducts.length > 0 || stats.outOfStockCount > 0) && (
        <div className="bg-white rounded-xl border border-amber-200 mb-8">
          <div className="flex items-center justify-between p-5 border-b border-amber-100 bg-amber-50">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              <h2 className="font-semibold text-amber-900">
                Stok Uyarısi
              </h2>
              {stats.outOfStockCount > 0 && (
                <span className="text-xs text-red-700 font-medium">
                  · {stats.outOfStockCount} ürün stokta yok
                </span>
              )}
            </div>
            <Link
              href="/admin/urunler"
              className="text-sm text-amber-700 hover:underline font-medium"
            >
              Tüm ürünler &rarr;
            </Link>
          </div>
          {stats.lowStockProducts.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">
              Az kalan ürün yok. {stats.outOfStockCount} ürün stokta olmadigi icin
              satistan dusurulmus durumda.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {stats.lowStockProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0 pr-3">
                    <Link
                      href={`/admin/urunler/${p.id}`}
                      className="text-sm font-medium text-brand-black hover:text-brand-gold-dark line-clamp-1"
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-gray-500 font-mono">{p.sku}</p>
                  </div>
                  <span className="text-sm font-semibold text-amber-700">
                    {p.stockQuantity} adet
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-brand-black">Son Siparişler</h2>
          <Link href="/admin/siparisler" className="text-sm text-brand-gold-dark hover:underline font-medium">
            Tümu &rarr;
          </Link>
        </div>
        {stats.recentOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Henuz sipariş yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Sipariş No</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Musteri</th>
                  <th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase">Durum</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                  <th className="text-right p-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-3">
                      <Link
                        href={`/admin/siparisler/${order.id}`}
                        className="font-medium text-brand-black hover:text-brand-gold-dark"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-brand-black">{order.user.name}</p>
                        <p className="text-xs text-gray-500">{order.user.email}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        order.status === "PENDING" || order.status === "APPROVED" ? "bg-amber-100 text-amber-700" :
                        order.status === "SHIPPED" ? "bg-purple-100 text-purple-700" :
                        order.status === "UNDELIVERED" ? "bg-orange-100 text-orange-700" :
                        order.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                        order.status === "CANCELLED" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {ORDER_STATUS_LABELS[order.status] || order.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{formatPrice(Number(order.total))}</td>
                    <td className="p-3 text-right text-gray-500">
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
