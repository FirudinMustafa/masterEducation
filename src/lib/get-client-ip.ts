/**
 * getClientIp — rate-limit + audit log için saglıklı istemci IP'si.
 *
 * Önceki implementasyon raw `x-forwarded-for` ilk hop'unu aliyordu:
 *   const ip = xff?.split(",")[0]?.trim() ?? ...
 * Bu, attacker'in basit `X-Forwarded-For: 1.2.3.4` header'i gondererek
 * per-IP rate-limit'i bypass etmesine yol aciyor (credential stuffing,
 * reset-email spam). QA orkestra 2026-05-18 — API-0001, API-0002.
 *
 * Cozum:
 *   - TRUSTED_PROXY=true: reverse-proxy varsa XFF'in SON elemanini kullan.
 *     Vercel/Nginx `x-forwarded-for: client, proxy1, proxy2` yazar;
 *     son giriş platform'un kendisinin gordugu kaynak — attacker
 *     kontrolu dasinda. Ayni zamanda Vercel `x-real-ip` set eder.
 *   - Aksi halde (dev, direct deployment): XFF tamamen IGNORE edilir.
 *     Yoksa attacker `X-Forwarded-For: random.ip.${i}.$i` ile bypass yapar.
 *     Tüm requestler "direct" bucket'inda toplanir — daha guvenli (false
 *     positive olur ama saldiri durdurulur).
 */

type HeadersLike = { get(name: string): string | null };

const TRUSTED_PROXY = process.env.TRUSTED_PROXY === "true";

export function getClientIp(headers: HeadersLike): string {
  if (TRUSTED_PROXY) {
    // Vercel + çoğu modern proxy x-real-ip set eder; en guvenilir kaynak.
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;

    // x-forwarded-for: "client, proxy1, proxy2" — SON eleman platform'un
    // gordugu kaynaktir, attacker kontrolu disinda.
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        return parts[parts.length - 1];
      }
    }
  }

  // Untrusted environment: raw XFF'i kabul etme, tüm istekler "direct" bucket'a
  // — saldirgan header rotate etse bile rate-limit bypass edemez.
  return "direct";
}
