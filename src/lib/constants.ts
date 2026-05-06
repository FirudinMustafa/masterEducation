// Satici sicil bilgileri — 6502 sayili Tuketicinin Korunmasi Hakkinda Kanun ve
// Mesafeli Sozlesmeler Yonetmeligi geregi sozlesme ve faturada bulunmasi
// gereken alanlar. Production icin `BRAND_TAX_OFFICE`, `BRAND_TAX_NUMBER`,
// `BRAND_MERSIS_NUMBER` env'leri ile override et. Bos kalirsa ilgili satirlar
// sozlesme/fatura sablonlarinda atlanir (crash yok), ama yasal gereklilik karsilanmaz.
export const BRAND = {
  name: "Master Education",
  phone: "0 539 411 65 95",
  whatsapp: "https://wa.me/905394116595",
  email: "info@mastereducation.com.tr",
  address: "Turkiye",
  taxOffice: process.env.BRAND_TAX_OFFICE ?? "",
  taxNumber: process.env.BRAND_TAX_NUMBER ?? "",
  mersisNumber: process.env.BRAND_MERSIS_NUMBER ?? "",
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
