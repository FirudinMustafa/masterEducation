import { sendEmail, templateCronFailureAdminNotice } from "@/lib/email";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";

/**
 * Cron handler wrapper. Hata olursa ADMIN_EMAIL'e bildirim yollar (E18).
 *
 * `await sendEmail` kullaniyoruz — fire-and-forget queueEmail Vercel'de
 * fonksiyon kapanmadan once gonderilemeyebilir. Cron failure mailinin
 * kacirilmamasi önemli; ekstra latency gormezden gelinir (cron zaten async).
 *
 * Hatayi yakalar, mail yollar, sonra yeniden frrlatir — Vercel loglari ve
 * error_logs hala gercegi gormeli.
 */
export async function runCronJob<T>(
  jobName: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorText = error.stack || error.message || String(err);
    const adminTo = env.ADMIN_EMAIL ?? BRAND.email;
    if (adminTo) {
      try {
        const tpl = templateCronFailureAdminNotice({
          jobName,
          error: errorText,
          when: new Date(),
        });
        await sendEmail({ ...tpl, to: adminTo });
      } catch (mailErr) {
        // Mail gonderim hatasi cron error'u maskelemeyecek — log'la, devam et.
        console.error(
          "[cron-runner] failure mail also failed",
          jobName,
          mailErr
        );
      }
    }
    throw err;
  }
}
