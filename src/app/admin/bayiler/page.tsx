import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import { AdminSearchBar } from "@/components/admin/search-bar";
import { DealersTable, type DealerRow } from "@/components/admin/dealers-table";

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
