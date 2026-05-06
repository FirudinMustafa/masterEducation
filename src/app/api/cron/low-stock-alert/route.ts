import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { runCronJob } from "@/lib/cron-runner";
import {
  queueEmail,
  templateLowStockDigest,
} from "@/lib/email";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * E17 — Dusuk stok daily digest. LOW_STOCK_THRESHOLD altinda olan
 * yayinda urunleri tek mail icinde admin'e raporlar. Vercel Cron
 * onerilen siklik: gunde 1 (08:00 UTC).
 *
 * Sadece publishedOnly: yayinda olmayan urunler raporlanmaz (hazir
 * olmayan envanteri tetiklemenin anlami yok).
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  return runCronJob("low-stock-alert", async () => {
    const threshold = env.LOW_STOCK_THRESHOLD;
    const lowItems = await prisma.product.findMany({
      where: {
        isPublished: true,
        stockQuantity: { lte: threshold },
      },
      select: {
        sku: true,
        name: true,
        slug: true,
        stockQuantity: true,
      },
      orderBy: [
        { stockQuantity: "asc" },
        { name: "asc" },
      ],
      // En kritikleri liste basinda — template ilk 50'yi gosterir.
      take: 200,
    });

    if (lowItems.length === 0) {
      return NextResponse.json({
        ok: true,
        total: 0,
        sent: false,
        threshold,
      });
    }

    const adminTo = env.ADMIN_EMAIL ?? BRAND.email;
    if (!adminTo) {
      return NextResponse.json({
        ok: true,
        total: lowItems.length,
        sent: false,
        skipped: "no_admin_email",
        threshold,
      });
    }

    const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
    const criticalCount = lowItems.filter((i) => i.stockQuantity === 0).length;
    const tpl = templateLowStockDigest({
      items: lowItems.map((i) => ({
        sku: i.sku,
        name: i.name,
        stock: i.stockQuantity,
        productUrl: `${base}/urun/${i.slug}`,
      })),
      total: lowItems.length,
      criticalCount,
      threshold,
    });
    queueEmail({ ...tpl, to: adminTo });

    return NextResponse.json({
      ok: true,
      total: lowItems.length,
      criticalCount,
      threshold,
      sent: true,
      at: new Date().toISOString(),
    });
  });
}
