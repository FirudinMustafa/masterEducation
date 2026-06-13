import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { BannerManager, type BannerItem } from "@/components/admin/banner-manager";

export const metadata: Metadata = { title: "Ana Sayfa Banner - Admin" };

export default async function AdminBannerPage() {
  const banners = await prisma.banner.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  const items: BannerItem[] = banners.map((b) => ({
    id: b.id,
    title: b.title,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
    displayOrder: b.displayOrder,
    isActive: b.isActive,
  }));

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">Ana Sayfa Banner</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ana sayfanın üst slider'ında gösterilen görselleri yönetin. Sadece &quot;Aktif&quot;
          bannerlar sırasıyla gösterilir.
        </p>
      </div>
      <BannerManager banners={items} />
    </div>
  );
}
