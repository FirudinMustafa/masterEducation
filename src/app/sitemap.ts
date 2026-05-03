import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const STATIC_PAGES = [
  "",
  "/urunler",
  "/kategoriler",
  "/yayinevleri",
  "/hakkimizda",
  "/iletisim",
  "/sss",
  "/iade",
  "/kvkk",
  "/giris",
  "/kayit",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr").replace(
    /\/$/,
    ""
  );

  const staticEntries: MetadataRoute.Sitemap = STATIC_PAGES.map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "" ? "daily" : "weekly",
    priority: p === "" ? 1 : 0.5,
  }));

  const [products, categories, publishers] = await Promise.all([
    prisma.product.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      take: 50_000,
    }),
    prisma.category.findMany({
      where: { type: "ana" },
      select: { slug: true },
    }),
    prisma.publisher.findMany({ select: { slug: true } }),
  ]);

  const productEntries: MetadataRoute.Sitemap = products.map((p) => ({
    url: `${base}/urunler/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${base}/kategoriler/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const publisherEntries: MetadataRoute.Sitemap = publishers.map((p) => ({
    url: `${base}/yayinevleri/${p.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...categoryEntries,
    ...publisherEntries,
    ...productEntries,
  ];
}
