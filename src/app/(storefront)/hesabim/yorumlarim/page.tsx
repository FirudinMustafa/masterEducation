import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productImageUrl } from "@/lib/images";
import { MyReviewsList } from "./my-reviews-list";

export const metadata: Metadata = { title: "Yorumlarim" };

export default async function MyReviewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/giris?callbackUrl=/hesabim/yorumlarim");

  const reviews = await prisma.productReview.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      status: true,
      createdAt: true,
      product: {
        select: {
          slug: true,
          name: true,
          images: {
            orderBy: { displayOrder: "asc" },
            take: 1,
            select: { filename: true },
          },
        },
      },
    },
  });

  const mapped = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    product: {
      slug: r.product.slug,
      name: r.product.name,
      imageSrc: r.product.images[0]
        ? productImageUrl(r.product.images[0].filename)
        : null,
    },
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-black">Yorumlarim</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {mapped.length} yorum
          </p>
        </div>
        <Link
          href="/hesabim"
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          ← Hesabim
        </Link>
      </div>

      {mapped.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center">
          <p className="text-sm text-neutral-500">
            Henuz hic yorum yazmadiniz.
          </p>
          <Link
            href="/urunler"
            className="mt-4 inline-block rounded-lg bg-brand-gold px-5 py-2 text-sm font-semibold text-neutral-800 hover:bg-brand-gold-dark"
          >
            Urunlere gozat
          </Link>
        </div>
      ) : (
        <MyReviewsList reviews={mapped} />
      )}
    </div>
  );
}
