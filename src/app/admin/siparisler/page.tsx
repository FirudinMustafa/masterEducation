import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminSearchBar } from "@/components/admin/search-bar";
import { OrdersTable, type OrderRow } from "@/components/admin/orders-table";
import { DISPLAY_STATUSES, resolveStatusFilter } from "@/lib/order-status";

export const metadata: Metadata = { title: "Siparişler - Admin" };

interface PageProps {
  searchParams: Promise<{ sayfa?: string; durum?: string; ara?: string; tip?: string }>;
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const status = params.durum || "";
  const search = params.ara?.trim() ?? "";
  // tip: "musteri" → user.dealer yok; "bayi" → user.dealer var; "" → hepsi
  const tip = params.tip === "bayi" || params.tip === "musteri" ? params.tip : "";
  const perPage = 20;

  const where: Record<string, unknown> = {};
  // durum: okultedarigim kova anahtarı (örn "gelen") veya ham kod → iç kod listesi.
  const statusCodes = resolveStatusFilter(status);
  if (statusCodes) {
    where.status = { in: statusCodes };
  }
  if (tip === "bayi") {
    // Bayisi olan siparişler — user.dealer relation'i mevcut olanlar
    where.user = { dealer: { isNot: null } };
  } else if (tip === "musteri") {
    where.user = { dealer: null };
  }
  if (search) {
    // Mevcut user filter'i preserve edilmeli (tip + search birlikte calissin)
    const userFilter = (where.user as Record<string, unknown>) ?? undefined;
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { shippingName: { contains: search, mode: "insensitive" } },
      { trackingNumber: { contains: search, mode: "insensitive" } },
      {
        user: {
          ...(userFilter ?? {}),
          email: { contains: search, mode: "insensitive" },
        },
      },
      {
        user: {
          ...(userFilter ?? {}),
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
    // OR icine user filter dahil edildigi icin disardakini kaldir
    if (userFilter) delete where.user;
  }

  // Tip toggle icin sayılari ayri hesapla — UI'da rozet göstermek icin
  const baseTypeWhere: Record<string, unknown> = { ...where };
  delete baseTypeWhere.user;
  delete baseTypeWhere.OR;
  const [customerCount, dealerCount] = await Promise.all([
    prisma.order.count({ where: { ...baseTypeWhere, user: { dealer: null } } }),
    prisma.order.count({ where: { ...baseTypeWhere, user: { dealer: { isNot: null } } } }),
  ]);

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            dealer: { select: { companyName: true } },
          },
        },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  // okultedarigim durum kovaları + "Tümü" — value = kova anahtarı.
  const statusFilters = [
    { value: "", label: "Tümü" },
    ...DISPLAY_STATUSES.map((d) => ({ value: d.key, label: d.label })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">Siparişler</h1>
          <p className="text-sm text-gray-500 mt-1">
            {total} sipariş
            {tip === "bayi" && " (yalniz bayiler)"}
            {tip === "musteri" && " (yalniz musteriler)"}
          </p>
        </div>
      </div>

      {/* Tip toggle — Musteri / Bayi siparişlerini ayir */}
      <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-1">
        {[
          { key: "", label: "Tümu", count: customerCount + dealerCount, color: "bg-neutral-900 text-white" },
          { key: "musteri", label: "Musteri", count: customerCount, color: "bg-sky-600 text-white" },
          { key: "bayi", label: "Bayi", count: dealerCount, color: "bg-emerald-600 text-white" },
        ].map((t) => {
          const qs = new URLSearchParams();
          if (t.key) qs.set("tip", t.key);
          if (status) qs.set("durum", status);
          if (search) qs.set("ara", search);
          const isActive = tip === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/siparisler${qs.toString() ? `?${qs.toString()}` : ""}`}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                isActive ? t.color : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[11px] ${isActive ? "opacity-80" : "opacity-50"}`}>
                {t.count}
              </span>
            </Link>
          );
        })}
      </div>

      <AdminSearchBar
        defaultValue={search}
        placeholder="Sipariş no, isim, email, kargo no..."
        hiddenParams={{ durum: status, tip }}
      />

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={(() => {
              const qs = new URLSearchParams();
              if (f.value) qs.set("durum", f.value);
              if (search) qs.set("ara", search);
              if (tip) qs.set("tip", tip);
              return `/admin/siparisler${qs.toString() ? `?${qs.toString()}` : ""}`;
            })()}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              status === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <OrdersTable
        orders={orders.map<OrderRow>((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.user.name,
          customerEmail: o.user.email,
          dealerCompanyName: o.user.dealer?.companyName ?? null,
          schoolName: o.schoolName,
          itemCount: o.items.length,
          paymentMethod: o.paymentMethod,
          status: o.status,
          total: Number(o.total),
          createdAt: o.createdAt,
        }))}
      />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <p className="text-sm text-gray-500">Sayfa {page} / {totalPages}</p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/siparisler?sayfa=${page - 1}${status ? `&durum=${status}` : ""}${search ? `&ara=${encodeURIComponent(search)}` : ""}${tip ? `&tip=${tip}` : ""}`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Önceki
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/siparisler?sayfa=${page + 1}${status ? `&durum=${status}` : ""}${search ? `&ara=${encodeURIComponent(search)}` : ""}${tip ? `&tip=${tip}` : ""}`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Sonraki
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
