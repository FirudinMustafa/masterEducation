import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminSearchBar } from "@/components/admin/search-bar";
import { DealersTable, type DealerRow } from "@/components/admin/dealers-table";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = { title: "Bayiler - Admin" };

interface PageProps {
  searchParams: Promise<{ durum?: string; ara?: string }>;
}

export default async function AdminDealersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const statusFilter = params.durum || "";
  const search = params.ara?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.status = statusFilter;
  }
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: "insensitive" } },
      { taxNumber: { contains: search, mode: "insensitive" } },
      { contactPerson: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const dealers = await prisma.dealer.findMany({
    where,
    include: {
      user: { select: { name: true, email: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Bayi siparişleri özeti (dashboard kartları). Tüm bayi siparişleri baz alınır
  // (liste filtresinden bağımsız). İade tutarı: onaylanmış bayi iadelerinin toplamı.
  const dealerOrderWhere = { user: { dealer: { isNot: null } } };
  const [orderCount, revenueAgg, refundAgg, itemAgg] = await Promise.all([
    prisma.order.count({ where: dealerOrderWhere }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { ...dealerOrderWhere, status: { not: "CANCELLED" } },
    }),
    prisma.return.aggregate({
      _sum: { totalAmount: true },
      where: { status: "APPROVED" },
    }),
    prisma.orderItem.aggregate({
      _sum: { quantity: true },
      where: { order: dealerOrderWhere },
    }),
  ]);
  const stats = [
    { label: "Toplam Sipariş", value: orderCount.toLocaleString("tr-TR"), tone: "bg-blue-50 text-blue-700" },
    { label: "Toplam Ürün", value: (itemAgg._sum.quantity ?? 0).toLocaleString("tr-TR"), tone: "bg-indigo-50 text-indigo-700" },
    { label: "Toplam Ciro", value: formatPrice(Number(revenueAgg._sum.total ?? 0)), tone: "bg-emerald-50 text-emerald-700" },
    { label: "İade Tutarı", value: formatPrice(Number(refundAgg._sum.totalAmount ?? 0)), tone: "bg-rose-50 text-rose-700" },
  ];

  const statusFilters = [
    { value: "", label: "Tümu" },
    { value: "PENDING", label: "Bekleyen" },
    { value: "APPROVED", label: "Onaylanan" },
    { value: "REJECTED", label: "Reddedilen" },
    { value: "SUSPENDED", label: "Askida" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">Bayiler</h1>
          <p className="text-sm text-gray-500 mt-1">{dealers.length} bayi</p>
        </div>
        <Link
          href="/admin/bayiler/yeni"
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black hover:bg-brand-gold-dark"
        >
          + Yeni Bayi Ekle
        </Link>
      </div>

      {/* Bayi siparişleri özet kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${s.tone}`}
            >
              {s.label}
            </span>
            <p className="mt-2 text-2xl font-bold text-brand-black">{s.value}</p>
          </div>
        ))}
      </div>

      <AdminSearchBar
        defaultValue={search}
        placeholder="Firma, vergi no, yetkili, email..."
        hiddenParams={{ durum: statusFilter }}
      />

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/bayiler${f.value ? `?durum=${f.value}` : ""}${search ? `${f.value ? "&" : "?"}ara=${encodeURIComponent(search)}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <DealersTable
        dealers={dealers.map<DealerRow>((d) => ({
          id: d.id,
          companyName: d.companyName,
          taxOffice: d.taxOffice,
          taxNumber: d.taxNumber,
          contactPerson: d.contactPerson,
          userName: d.user.name,
          userEmail: d.user.email,
          userPhone: d.user.phone,
          status: d.status,
          paymentTerms: d.paymentTerms,
          creditLimit: Number(d.creditLimit),
          currentBalance: Number(d.currentBalance),
          createdAt: d.createdAt,
        }))}
      />
    </div>
  );
}
