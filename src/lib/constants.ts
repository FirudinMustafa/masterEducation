// Satici sicil bilgileri — 6502 sayıli Tuketicinin Korunmasi Hakkinda Kanun ve
// Mesafeli Sözleşmeler Yonetmeligi geregi sözleşme ve faturada bulunmasi
// gereken alanlar. Production icin `BRAND_TAX_OFFICE`, `BRAND_TAX_NUMBER`,
// `BRAND_MERSIS_NUMBER` env'leri ile override et. Bos kalirsa ilgili satirlar
// sözleşme/fatura sablonlarinda atlanir (crash yok), ama yasal gereklilik karsilanmaz.
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

/**
 * Satıcının resmi sicil/cari kimliği — teslim fişi (irsaliye) belgelerinde
 * başlıkta gösterilir. Fatura/kayıt özetinden farklı olarak burada tam ticaret
 * ünvanı ve vergi bilgileri yer alır.
 */
export const LEGAL_SELLER = {
  title: "MASTER ELT EĞİTİM YAYINCILIK TİCARET LİMİTED ŞİRKETİ",
  address:
    "ZİYA GÖKALP MAH. SÜLEYMAN DEMİREL BLV. THE OFFICE NO: 7 E İÇ KAPI NO: 136 BAŞAKŞEHİR / İSTANBUL",
  taxOffice: "İKİTELLİ",
  taxNumber: "6131923346",
  phone: "0850 309 25 18",
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

// Admin ürün listesi sayfa boyutu (mağaza vitrininden ayrı — admin toplu
// yönetim için 100'lü sayfalar ister).
export const ADMIN_PRODUCTS_PER_PAGE = 100;

// Ürün formundaki "Dil" alanı için sabit seçenek listesi (serbest metin yerine
// dropdown). CSV import'undan gelen kod değerleri yerine temiz liste.
export const PRODUCT_LANGUAGES = [
  "Türkçe",
  "İngilizce",
  "Almanca",
  "Fransızca",
  "Arapça",
  "İspanyolca",
  "Rusça",
  "İtalyanca",
] as const;

export const VAT_RATES = {
  PRINTED_BOOK: 0,
  STATIONERY: 8,
  DIGITAL: 20,
} as const;

// Sipariş durumları okultedarigim modeline göre etiketlenir (2026-06-13).
// Enum kodları korunur; PENDING ve APPROVED kullanıcıya tek "Gelen Sipariş"
// kovası olarak gösterilir (kart ödemesi APPROVED set ettiği için ikisi de
// aynı görünür). Görünüm kovaları için bkz. lib/order-status DISPLAY_STATUSES.
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Gelen Sipariş",
  APPROVED: "Gelen Sipariş",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Dağıtımda",
  UNDELIVERED: "Teslim Edilemeyen",
  DELIVERED: "Tamamlandı",
  CANCELLED: "İptal/İade",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CREDIT_CARD: "Kredi Karti",
  OPEN_ACCOUNT: "Acik Hesap",
};
