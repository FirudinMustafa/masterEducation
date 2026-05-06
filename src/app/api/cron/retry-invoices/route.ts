import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { retryFailedInvoices } from "@/lib/invoice-service";
import { runCronJob } from "@/lib/cron-runner";

export const dynamic = "force-dynamic";

/**
 * KolayBi e-fatura retry job. PENDING/FAILED invoice'ları (max attempt
 * altında) sırayla tekrar dener. Vercel Cron önerilen sıklık: 30 dk.
 */
export async function GET(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  return runCronJob("retry-invoices", async () => {
    const result = await retryFailedInvoices();
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  });
}
