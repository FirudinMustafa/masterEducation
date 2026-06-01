import type { CargoCarrier } from "@prisma/client";

export interface CarrierMeta {
  label: string;
  trackingUrl: (trackingNumber: string) => string | null;
  color: string;
}

// URL'ler kargo firmalarinin halka acik takip sayfalaridir. Degisirse
// burada tek noktada güncellenir.
export const CARGO_CARRIERS: Record<CargoCarrier, CarrierMeta> = {
  ARAS: {
    label: "Aras Kargo",
    trackingUrl: (no) =>
      `https://kargotakip.araskargo.com.tr/mainpage.aspx?code=${encodeURIComponent(no)}`,
    color: "#0066B3",
  },
  YURTICI: {
    label: "Yurtici Kargo",
    trackingUrl: (no) =>
      `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(no)}`,
    color: "#E3000F",
  },
  MNG: {
    label: "MNG Kargo",
    trackingUrl: (no) =>
      `https://www.mngkargo.com.tr/tr/gonderitakip?takipno=${encodeURIComponent(no)}`,
    color: "#FF7F00",
  },
  PTT: {
    label: "PTT Kargo",
    trackingUrl: (no) =>
      `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(no)}`,
    color: "#F5D000",
  },
  SURAT: {
    label: "Surat Kargo",
    trackingUrl: (no) =>
      `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(no)}`,
    color: "#E10600",
  },
  KOLAY_GELSIN: {
    label: "Kolay Gelsin",
    trackingUrl: (no) =>
      `https://www.kolaygelsin.com/tr/gonderi-takip?code=${encodeURIComponent(no)}`,
    color: "#FF6B00",
  },
  HEPSIJET: {
    label: "HepsiJet",
    trackingUrl: (no) =>
      `https://hepsijet.com/gonderi-takibi?trackingNumber=${encodeURIComponent(no)}`,
    color: "#FF6000",
  },
  TRENDYOL: {
    label: "Trendyol Express",
    trackingUrl: (no) =>
      `https://trendyolexpress.com/gonderi-takip?code=${encodeURIComponent(no)}`,
    color: "#F27A1A",
  },
  DEPODAN_TESLIM: {
    label: "Depodan Teslim",
    trackingUrl: () => null, // depodan elden/araçla teslim — harici takip yok
    color: "#0F766E",
  },
  OTHER: {
    label: "Diger",
    trackingUrl: () => null, // serbest metin — otomatik link yok
    color: "#6B7280",
  },
};

export function carrierLabel(
  carrier: CargoCarrier | null,
  fallbackName: string | null,
): string {
  if (!carrier) return "Kargo firmasi atanmadi";
  if (carrier === "OTHER" && fallbackName) return fallbackName;
  return CARGO_CARRIERS[carrier].label;
}

export function carrierTrackingUrl(
  carrier: CargoCarrier | null,
  trackingNumber: string | null,
): string | null {
  if (!carrier || !trackingNumber) return null;
  return CARGO_CARRIERS[carrier].trackingUrl(trackingNumber);
}
