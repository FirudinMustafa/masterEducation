import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ReviewModeration } from "@/components/admin/review-moderation";
import { AdminSearchBar } from "@/components/admin/search-bar";

export const metadata: Metadata = { title: "Yorumlar - Admin" };

interface PageProps {
  searchParams: Promise<{ durum?: string; ara?: string }>;
}

export default async function AdminReviewsPage({ searchParams }: PageProps) {
  const { durum, ara } = await searchParams;
  // Yorumlar artik default APPROVED yayinlaniyor — admin panelinde varsayilan
  // "yayinda olan" yorumlari göster ki silinebilsin.
  const statusFilter =
    durum === "PENDING" || durum === "REJECTED" ? durum : "APPROVED";
  const search = ara?.trim() ?? "";

  const where: Record<string, unknown> = { status: statusFilter };
  if (search) {
    where.OR = [
      { comment: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { product: { name: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const reviews = await prisma.productReview.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, email: true } },
      product: { select: { name: true, slug: true } },
    },
  });

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold text-brand-black">
          Yorum Yönetimi
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {reviews.length} {statusFilter === "APPROVED" ? "yayinda" : statusFilter === "PENDING" ? "beklemede" : "gizli"} yorum
        </p>
      </div>

      <AdminSearchBar
        defaultValue={search}
        placeholder="Yorum icerigi, ürün, kullanıcı..."
        hiddenParams={{ durum: statusFilter }}
      />

      <div className="flex gap-2">
        {(["APPROVED", "PENDING", "REJECTED"] as const).map((s) => (
          <a
            key={s}
            href={`/admin/yorumlar?durum=${s}${search ? `&ara=${encodeURIComponent(search)}` : ""}`}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === s
                ? "bg-brand-gold text-brand-black border-brand-gold font-semibold"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {s === "APPROVED"
              ? "Yayinda"
              : s === "PENDING"
                ? "Beklemede"
                : "Gizli"}
          </a>
        ))}
      </div>

      <ReviewModeration
        reviews={reviews.map((r) => ({
          id: r.id,
          productName: r.product.name,
          productSlug: r.product.slug,
          authorName: r.user.name,
          authorEmail: r.user.email,
          rating: r.rating,
          title: r.title,
          comment: r.comment,
          status: r.status,
          createdAt: r.createdAt,
        }))}
      />
    </div>
  );
}
