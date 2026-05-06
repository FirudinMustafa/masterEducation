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
 *   - encoded form (`%2f%2f`, `%09//evil`, `%0a//evil`) decode-once sonrası
 *     da bu kurallara uymalı
 */

// ASCII control chars — Chrome/Firefox bazı `\t`/`\n` prefix'leri yok sayıp
// redirect zincirini bozabilir. 0x00-0x1F + DEL (0x7F).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]");

export function safeCallbackUrl(
  input: string | null | undefined,
  fallback = "/"
): string {
  if (!input || typeof input !== "string") return fallback;
  const raw = input.trim();
  if (raw.length === 0) return fallback;

  // Decode-once: %2f%2fevil.com / %09//evil.com / %0a... gibi encoded bypass'ları
  // ham karşılaştırmadan önce normalize et. decodeURIComponent geçersiz
  // sequence'larda atar; o durumda fallback ver.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  // Ham veya decoded değerde control char varsa reddet.
  if (CONTROL_CHARS.test(raw) || CONTROL_CHARS.test(decoded)) return fallback;

  // Hem ham hem decoded değer "/" ile başlamalı, "//" ile başlayamaz, ":" ile
  // protocol bypass'ı yapamaz, "\" backslash içermemeli.
  for (const v of [raw, decoded]) {
    if (!v.startsWith("/")) return fallback;
    if (v.startsWith("//")) return fallback;
    if (v.startsWith("/\\")) return fallback;
    if (v.includes("\\")) return fallback;
    if (/^[/]+[a-zA-Z]+:/.test(v)) return fallback;
  }
  return raw;
}
