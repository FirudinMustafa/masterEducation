import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { UserActions } from "@/components/admin/user-actions";

export const metadata: Metadata = { title: "Kullanici Detayi - Admin" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [session, user] = await Promise.all([
    auth(),
    prisma.user.findUnique({
      where: { id },
      include: {
        dealer: true,
        addresses: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
        _count: { select: { orders: true } },
      },
    }),
  ]);

  if (!user) notFound();

  const isSelf = session?.user?.id === user.id;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/kullanicilar"
          className="text-sm text-gray-500 hover:text-brand-black"
        >
          &larr; Kullanicilar
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          {user.name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{user.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Hesap</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Rol" value={user.role} />
            <Row label="Telefon" value={user.phone ?? "-"} />
            <Row
              label="Kayit"
              value={new Date(user.createdAt).toLocaleDateString("tr-TR")}
            />
            <Row label="Toplam Siparis" value={String(user._count.orders)} />
          </dl>
        </div>
        {user.dealer && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-brand-black mb-3">Bayi Bilgileri</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Firma" value={user.dealer.companyName} />
              <Row label="Vergi No" value={user.dealer.taxNumber} />
              <Row label="Statu" value={user.dealer.status} />
              <Row
                label="Kredi Limiti"
                value={formatPrice(Number(user.dealer.creditLimit))}
              />
              <Row
                label="Cari Bakiye"
                value={formatPrice(Number(user.dealer.currentBalance))}
              />
            </dl>
            <Link
              href={`/admin/bayiler/${user.dealer.id}`}
              className="inline-block mt-3 text-sm text-brand-gold-dark hover:underline"
            >
              Bayi sayfasina git &rarr;
            </Link>
          </div>
        )}
      </div>

      <UserActions
        userId={user.id}
        currentRole={user.role}
        hasDealer={!!user.dealer}
        orderCount={user._count.orders}
        isSelf={isSelf}
      />

      {user.orders.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-brand-black mb-3">Son Siparisler</h2>
          <ul className="divide-y divide-gray-100">
            {user.orders.map((o) => (
              <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                <Link
                  href={`/admin/siparisler/${o.id}`}
                  className="font-medium text-brand-black hover:text-brand-gold-dark"
                >
                  {o.orderNumber}
                </Link>
                <span className="text-xs text-gray-500">
                  {ORDER_STATUS_LABELS[o.status] ?? o.status} ·{" "}
                  {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                </span>
                <span className="font-medium">
                  {formatPrice(Number(o.total))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-brand-black text-right">{value}</dd>
    </div>
  );
}
