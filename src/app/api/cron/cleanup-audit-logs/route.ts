import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/cron-runner";

export const dynamic = "force-dynamic";

/**
 * Audit log retention — 365 günden eski kayıtlari siler.
 *
 * KVKK madde 4/2-d: kisisel verilerin gerekli oldugu sure kadar
 * saklanmasi prensibi. 1 yil; gerekli olanlar (ornegin sipariş'in
 * sözleşme onayi gibi) zaten Order tablosunda kalir.
 *
 * Vercel Cron sıkligi: günde 1 (4am).
 *
 * Page views icin de ayni mantik — 90 gün (analitik amaclar icin yeter).
 */
const AUDIT_RETENTION_DAYS = 365;
const PAGEVIEW_RETENTION_DAYS = 90;
const ERROR_LOG_RETENTION_DAYS = 90;

export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  return runCronJob("cleanup-audit-logs", async () => {
    const now = Date.now();
    const auditCutoff = new Date(now - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const pvCutoff = new Date(now - PAGEVIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const errCutoff = new Date(now - ERROR_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const [auditDeleted, pvDeleted, errDeleted] = await Promise.all([
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      prisma.pageView.deleteMany({ where: { createdAt: { lt: pvCutoff } } }),
      prisma.errorLog.deleteMany({ where: { createdAt: { lt: errCutoff } } }),
    ]);

    return NextResponse.json({
      ok: true,
      auditDeleted: auditDeleted.count,
      pageViewsDeleted: pvDeleted.count,
      errorLogsDeleted: errDeleted.count,
      at: new Date().toISOString(),
    });
  });
}
