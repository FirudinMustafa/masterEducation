/**
 * Very small BIN/format helpers for the mock 3D Secure flow. Not a real
 * card validator — just enough to let the UI show a "Visa ****1234" summary
 * and reject obviously invalid inputs.
 */

export type CardBrand = "VISA" | "MASTERCARD" | "AMEX" | "TROY" | "UNKNOWN";

export function detectBrand(digitsOnly: string): CardBrand {
  if (!/^\d+$/.test(digitsOnly)) return "UNKNOWN";
  if (/^4/.test(digitsOnly)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(digitsOnly)) return "MASTERCARD";
  if (/^3[47]/.test(digitsOnly)) return "AMEX";
  if (/^9792/.test(digitsOnly)) return "TROY";
  return "UNKNOWN";
}

export function luhnValid(digitsOnly: string): boolean {
  if (!/^\d{12,19}$/.test(digitsOnly)) return false;
  let sum = 0;
  let flip = false;
  for (let i = digitsOnly.length - 1; i >= 0; i--) {
    let n = Number(digitsOnly[i]);
    if (flip) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    flip = !flip;
  }
  return sum % 10 === 0;
}

export function normalizeCard(input: string): string {
  return input.replace(/\D/g, "");
}

export function lastFour(digitsOnly: string): string {
  return digitsOnly.slice(-4);
}

export function validExpiry(input: string): boolean {
  const m = input.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const end = new Date(year, month, 1); // first day AFTER expiry month
  return end > new Date();
}
