import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/bayi", "/api", "/hesabim", "/odeme", "/sepet"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
