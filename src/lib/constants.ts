export const BRAND = {
  name: "Master Education",
  phone: "0 539 411 65 95",
  whatsapp: "https://wa.me/905394116595",
  email: "info@mastereducation.com.tr",
  address: "Turkiye",
  // Satici sicil bilgileri — gercek e-Arsiv / e-Fatura entegrasyonu yapilana
  // kadar placeholder. Canliya gecmeden once dogru degerlerle doldurulmali.
  taxOffice: "",
  taxNumber: "",
  mersisNumber: "",
} as const;

export const COLORS = {
  gold: "#F5B800",
  goldLight: "#FDE68A",
  goldDark: "#D4A000",
  black: "#0F0F0F",
  offWhite: "#FAFAF8",
  warmGray: "#F0EDE8",
} as const;

export const PRODUCTS_PER_PAGE = 24;

export const VAT_RATES = {
  PRINTED_BOOK: 0,
  STATIONERY: 8,
  DIGITAL: 20,
} as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Onay Bekliyor",
  APPROVED: "Onaylandi",
  PROCESSING: "Hazirlaniyor",
  SHIPPED: "Kargoya Verildi",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "Iptal Edildi",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: "Kredi Karti",
  OPEN_ACCOUNT: "Acik Hesap",
};
