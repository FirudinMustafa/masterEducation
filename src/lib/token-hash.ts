import crypto from "crypto";

/**
 * Reset / verification token'ları için tek-yönlü hash.
 *
 * Token'ı email URL'inde plain gönderiyoruz, ama DB'de SHA-256 hash saklarız.
 * DB breach'inde saldırgan token'ı kullanamaz; sadece hash'leri görür ve
 * tersini bulamaz.
 *
 * SHA-256 yeterli (token zaten 32 byte rastgele) — bcrypt gereksiz CPU yükü.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
