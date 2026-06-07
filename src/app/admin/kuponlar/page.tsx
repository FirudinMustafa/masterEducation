import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CouponManager } from "@/components/admin/coupon-manager";
import { AdminSearchBar } from "@/components/admin/search-bar";

export const metadata: Metadata = { title: "Kuponlar - Admin" };

interface PageProps {
  searchParams: Promise<{ ara?: string }>;
}

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.ara?.trim() ?? "";

  const coupons = await prisma.coupon.findMany({
    where: search
      ? { code: { contains: search.toUpperCase(), mode: "insensitive" } }
      : undefined,
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Kuponlar
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Promosyon kodlari yonetin. Yuzde, sabit tutar veya ücretsiz kargo
          kuponlari oluşturabilirsiniz.
        </p>
      </div>

      <AdminSearchBar
        defaultValue={search}
        placeholder="Kupon kodu ile ara..."
      />

      <CouponManager
        coupons={coupons.map((c) => ({
          id: c.id,
          code: c.code,
          kind: c.kind,
          value: Number(c.value),
          minSubtotal: Number(c.minSubtotal),
          maxUses: c.maxUses,
          usedCount: c.usedCount,
          validFrom: c.validFrom,
          validUntil: c.validUntil,
          isActive: c.isActive,
        }))}
      />
    </div>
  );
}
