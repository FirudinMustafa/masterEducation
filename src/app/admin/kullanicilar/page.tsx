import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PRODUCTS_PER_PAGE } from "@/lib/constants";
import { UsersTable, type UserRow } from "@/components/admin/users-table";

export const metadata: Metadata = { title: "Kullanicilar - Admin" };

interface PageProps {
  searchParams: Promise<{ sayfa?: string; rol?: string; ara?: string; silinmis?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await auth();
  const page = Math.max(1, parseInt(params.sayfa || "1"));
  const roleFilter = params.rol || "";
  const search = params.ara || "";
  // Silinmiş (anonimleştirilmiş) hesaplar default'ta gizli — ?silinmis=1 ile göster
  const showDeleted = params.silinmis === "1";
  const perPage = PRODUCTS_PER_PAGE;

  const where: Record<string, unknown> = {};
  if (roleFilter && ["CUSTOMER", "DEALER", "ADMIN"].includes(roleFilter)) {
    where.role = roleFilter;
  }
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }
  // Anonimleştirilen hesapları (deleted-xxx@example.invalid) varsayılan filtrele
  if (!showDeleted) {
    where.NOT = { email: { endsWith: "@example.invalid" } };
  }

  // Silinmis kayit sayisini ayrica say (toggle linki icin)
  const deletedCount = await prisma.user.count({
    where: { email: { endsWith: "@example.invalid" } },
  });

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        dealer: { select: { companyName: true, status: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const filters: { value: string; label: string }[] = [
    { value: "", label: "Tumu" },
    { value: "CUSTOMER", label: "Musteri" },
    { value: "DEALER", label: "Bayi" },
    { value: "ADMIN", label: "Admin" },
  ];

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    companyName: u.dealer?.companyName ?? null,
    dealerStatus: u.dealer?.status ?? null,
    orderCount: u._count.orders,
    createdAt: u.createdAt,
  }));

  return (
    <div className="pb-20">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-brand-black">
            Kullanicilar
          </h1>
          <p className="mt-1 text-sm text-gray-500">{total} kullanici</p>
        </div>
        {deletedCount > 0 && (
          <Link
            href={`/admin/kullanicilar${showDeleted ? "" : "?silinmis=1"}`}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              showDeleted
                ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {showDeleted ? "↩ Gizle" : `🗑 ${deletedCount} silinmis hesabi goster`}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <Link
            key={f.value}
            href={`/admin/kullanicilar${f.value ? `?rol=${f.value}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              roleFilter === f.value
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <form className="mb-4">
        <input
          type="search"
          name="ara"
          defaultValue={search}
          placeholder="Ad veya email ile ara..."
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        {roleFilter && <input type="hidden" name="rol" value={roleFilter} />}
      </form>

      <UsersTable users={rows} currentUserId={session?.user?.id ?? ""} />

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <p className="text-sm text-gray-500">
            Sayfa {page} / {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/kullanicilar?sayfa=${page - 1}${
                  roleFilter ? `&rol=${roleFilter}` : ""
                }${search ? `&ara=${search}` : ""}`}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Onceki
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/kullanicilar?sayfa=${page + 1}${
                  roleFilter ? `&rol=${roleFilter}` : ""
                }${search ? `&ara=${search}` : ""}`}
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
