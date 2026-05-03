/**
 * callbackUrl query parametresi için open-redirect koruması.
 *
 * NextAuth signIn options.callbackUrl'i + custom redirect mantığı dahil her
 * yerde kullan. Saldırgan `/giris?callbackUrl=https://evil.com` ile
 * yönlendirme zincirini kontrol edemez.
 *
 * Sadece **same-origin relative path**'lere izin ver:
 *   - "/" ile başlamalı
 *   - "//" ile başlayamaz (protocol-relative)
 *   - ":" içeremez (URL scheme bypass'ı engeli)
 *   - "\" içeremez (Windows path / encoded slash bypass'ı)
 */
export function safeCallbackUrl(
  input: string | null | undefined,
  fallback = "/"
): string {
  if (!input || typeof input !== "string") return fallback;
  const v = input.trim();
  if (v.length === 0) return fallback;
  if (!v.startsWith("/")) return fallback;
  // Protocol-relative URL: "//evil.com/path"
  if (v.startsWith("//")) return fallback;
  // Backslash bypass: "/\evil.com" bazı tarayıcılarda double-slash gibi parse edilir
  if (v.startsWith("/\\")) return fallback;
  // Hash veya query'ye ek olarak protokol içeren tehlikeli kombinasyonlar
  // "/" ile başlasa bile "javascript:" gibi protokol denenmesin
  // (gerçi `router.push()` zaten relative bekler ama defensive)
  if (/^[/]+[a-zA-Z]+:/.test(v)) return fallback;
  return v;
}
