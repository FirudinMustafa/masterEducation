import { z } from "zod";
import { isValidLocation } from "@/lib/turkey-locations";

const nullableString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v));

/**
 * Faz 19: TR telefon doğrulama.
 *
 * Kabul edilen formatlar (normalize sonrası 10 hane):
 *   05XX XXX XX XX, +90 5XX XXX XX XX, 0090 5XX..., 5XX XXX XX XX
 * Mobil + sabit hattı kapsar (5/2/3/4 ile başlayan operatör/alan kodları).
 *
 * Normalize: tüm boşluk/tire/paren temizlenir, başındaki +90 / 0090 / 0
 * çıkarılır. Sonuç 10 hane olmalı, ilk hane 2-5 arası.
 */
function normalizeTrPhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-()]/g, "");
  let m = digits;
  if (m.startsWith("+90")) m = m.slice(3);
  else if (m.startsWith("0090")) m = m.slice(4);
  else if (m.startsWith("90") && m.length === 12) m = m.slice(2);
  if (m.startsWith("0")) m = m.slice(1);
  // 10 hane, ilk hane 2-5 (mobil 5xx, sabit 2xx-4xx)
  if (!/^[2-5]\d{9}$/.test(m)) return null;
  return m;
}

const trPhoneSchema = z
  .string()
  .min(10, "Telefon en az 10 hane olmali.")
  .max(20)
  .transform((v, ctx) => {
    const norm = normalizeTrPhone(v);
    if (!norm) {
      ctx.addIssue({
        code: "custom",
        message: "Gecerli bir TR telefon numarasi girin (orn. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return norm;
  });

const optionalTrPhoneSchema = z
  .string()
  .max(20)
  .optional()
  .or(z.literal(""))
  .transform((v, ctx) => {
    if (!v) return null;
    const norm = normalizeTrPhone(v);
    if (!norm) {
      ctx.addIssue({
        code: "custom",
        message: "Gecerli bir TR telefon numarasi girin (orn. 0532 123 45 67).",
      });
      return z.NEVER;
    }
    return norm;
  });

export const registerSchema = z.object({
  name: z.string().min(2, "Ad en az 2 karakter olmalidir.").max(100),
  email: z.email("Gecerli bir email adresi girin.").toLowerCase(),
  phone: optionalTrPhoneSchema,
  password: z
    .string()
    .min(8, "Sifre en az 8 karakter olmalidir.")
    .max(128)
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
      message: "Sifre en az bir harf ve bir rakam icermelidir.",
    }),
  // KVKK acik riza — uye olabilmek icin Uyelik Sozlesmesi + KVKK Aydinlatma
  // Metni'ni okudugu beyani gerekir. Form'da tek checkbox; backend bu literal
  // true degerini bekler (default = anlamsiz, eksik onay = kabul yok).
  termsAccepted: z.literal(true, { error: "Devam etmek icin sozlesmeleri onaylamaniz gerekir." }),
  // Ticari elektronik ileti (TETIK) — opsiyonel, default false. Kullanici
  // boyle bir mail almak isterse aktif eder; sonradan kapatabilir.
  marketingConsent: z.boolean().default(false),
  // Honeypot — formda gorunmez "website" alani. Insan asla doldurmaz; bot'lar
  // <input name="website"> goruyorsa otomatik doldurmaya calisir. Dolduysa
  // sessizce reddederiz (saldirgan loglara bakip ayrim yapamasin diye yine
  // 200 donulebilir; biz simdilik 400 doneriz, audit'e dusup gozetlenir).
  website: z
    .string()
    .max(0, "Bot tespit edildi.")
    .optional()
    .or(z.literal(""))
    .transform(() => undefined),
});

export const dealerApplySchema = z.object({
  name: z.string().min(2).max(100),
  email: z.email().toLowerCase(),
  phone: trPhoneSchema,
  password: z.string().min(6).max(128),
  companyName: z.string().min(2).max(200),
  taxOffice: z.string().min(2).max(100),
  taxNumber: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{10,11}$/, "Vergi numarasi 10 veya 11 haneli olmalidir.")),
  tradeRegNo: z.string().max(50).optional().or(z.literal("")).transform((v) => v || null),
  contactPerson: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  city: z.string().min(2).max(50),
  district: z.string().min(2).max(50),
  addressLine: z.string().min(5).max(500),
  termsAccepted: z.literal(true, { error: "Devam etmek icin sozlesmeleri onaylamaniz gerekir." }),
  marketingConsent: z.boolean().default(false),
}).refine(
  (v) => isValidLocation(v.city, v.district),
  { message: "Il/ilce listesi disinda bir deger.", path: ["city"] }
);

export const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
});

export const orderCreateSchema = z.object({
  items: z.array(orderItemSchema).min(1, "Sepetiniz bos."),
  shipping: z.object({
    fullName: z.string().min(2).max(200),
    email: z.email(),
    phone: trPhoneSchema,
    city: z.string().min(2).max(50),
    district: z.string().min(2).max(50),
    postalCode: z.string().max(20).optional().or(z.literal("")).transform((v) => v || ""),
    address: z.string().min(5).max(500),
  }).refine(
    (v) => isValidLocation(v.city, v.district),
    { message: "Il/ilce listesi disinda bir deger.", path: ["city"] }
  ),
  paymentMethod: z.enum(["CREDIT_CARD", "OPEN_ACCOUNT"]),
  // Card details arrive only in pre-3DS request bodies for CREDIT_CARD.
  // They are NEVER stored — only lastFour/brand survive in PaymentSession.
  card: z
    .object({
      number: z.string().min(12).max(24),
      expiry: z.string().min(4).max(7),
      cvv: z.string().min(3).max(4),
      holderName: z.string().min(2).max(100),
    })
    .optional(),
  couponCode: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  note: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  // Mesafeli Satis Sozlesmesi + On Bilgilendirme Formu onayi (zorunlu).
  // Yasal kanit — true literali bekleniyor.
  contractsAccepted: z.literal(true, {
    error: "Mesafeli Satis Sozlesmesi ve On Bilgilendirme Formu'nu onaylamaniz gerekir.",
  }),
});

export const paymentConfirmSchema = z.object({
  token: z.string().min(10).max(200),
  action: z.enum(["success", "failure"]),
  otp: z.string().max(10).optional(),
});

// Coupon — default'lar yalnızca create'te (PATCH'te otomatik default
// uygulanması minSubtotal=0 ve isActive=true ile silently override eder).
const couponBaseShape = {
  code: z
    .string()
    .min(2)
    .max(40)
    // Türk lokali ile uppercase: kullanıcının "ÜRÜN10" yazması ile admin'in
    // "ürün10" girmesi aynı koda normalize olur (evaluateCoupon ile uyum).
    .transform((v) => v.trim().toLocaleUpperCase("tr-TR")),
  kind: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  value: z.number().min(0).max(999_999),
  minSubtotal: z.number().min(0).max(999_999),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  isActive: z.boolean(),
};

export const couponCreateSchema = z.object({
  ...couponBaseShape,
  minSubtotal: couponBaseShape.minSubtotal.default(0),
  isActive: couponBaseShape.isActive.default(true),
});

export const couponUpdateSchema = z.object(couponBaseShape).partial();

export const reviewCreateSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: nullableString(200),
  comment: z.string().min(3).max(2000),
});

export const reviewUpdateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: nullableString(200),
  comment: z.string().min(3).max(2000),
});

export const reviewModerationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export const forgotPasswordSchema = z.object({
  email: z.email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6).max(128),
});

export const dealerStatusUpdateSchema = z.object({
  // Null ve undefined her ikisi de "bu alani degistirme" anlaminda.
  rejectionReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  creditLimit: z.number().min(0).max(9999999).nullable().optional(),
  paymentTerms: z.enum(["OPEN_ACCOUNT", "PREPAID"]).optional(),
}).refine(
  // PREPAID modunda creditLimit > 0 mantiksiz; uyari niyetinde 0'a sıfırla
  // (admin form da aynı davranışı uygular). Burada sadece tutarsızlığı engelle.
  (v) => !(v.paymentTerms === "PREPAID" && (v.creditLimit ?? 0) > 0),
  { message: "PREPAID modunda kredi limiti 0 olmalidir.", path: ["creditLimit"] }
);

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
  trackingNumber: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  trackingCarrier: z
    .enum([
      "ARAS",
      "YURTICI",
      "MNG",
      "PTT",
      "SURAT",
      "KOLAY_GELSIN",
      "HEPSIJET",
      "TRENDYOL",
      "OTHER",
    ])
    .nullable()
    .optional(),
  trackingCarrierName: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  estimatedDeliveryAt: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .nullable()
    .optional(),
  adminNote: z.string().max(500).optional().or(z.literal("")).transform((v) => v || null),
});

export const discountRuleSchema = z.object({
  dealerId: z.string().min(1),
  scope: z.enum(["PRODUCT", "CATEGORY", "PUBLISHER", "DISCOUNT_GROUP", "GLOBAL"]),
  discountPct: z.number().min(0).max(100),
  productId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  publisherId: z.string().optional().nullable(),
  discountGroup: z.string().optional().nullable(),
});

// Update şemasında default'lar uygulanmamalı — yoksa `.partial()` ile kombine
// edildiğinde, alanı göndermeyen PATCH otomatik default'a düşer ve silently
// stockQuantity → 0, vatRate → 0, isPublished → true gibi alanları sıfırlar.
// (Faz 18 e2e regression: prod1 stock=60 → PATCH price=130 → stock=0.)
const productBaseShape = {
  name: z.string().min(2).max(300),
  nameEn: nullableString(300),
  sku: z.string().min(1).max(64),
  price: z.number().min(0).max(999_999),
  oldPrice: z.number().min(0).max(999_999).optional().nullable(),
  vatRate: z.number().min(0).max(100),
  stockQuantity: z.number().int().min(0).max(1_000_000),
  publisherId: nullableString(64),
  categoryId: nullableString(64),
  anaTur: nullableString(100),
  detayTur: nullableString(100),
  language: nullableString(50),
  productType: nullableString(50),
  discountGroup: nullableString(100),
  authorCode: nullableString(64),
  isPublished: z.boolean(),
};

export const productCreateSchema = z.object({
  ...productBaseShape,
  // Default'lar SADECE create'te uygulanır; update'e yansımasın diye base'den
  // ayrı tanımlandı.
  vatRate: productBaseShape.vatRate.default(0),
  stockQuantity: productBaseShape.stockQuantity.default(0),
  isPublished: productBaseShape.isPublished.default(true),
});

export const productUpdateSchema = z.object(productBaseShape).partial();

// Category — type default'u sadece create'te (PATCH'te detay → ana'ya
// silently dönmemeli).
const categoryBaseShape = {
  name: z.string().min(2).max(200),
  type: z.enum(["ana", "detay"]),
};

export const categoryCreateSchema = z.object({
  ...categoryBaseShape,
  type: categoryBaseShape.type.default("ana"),
});

export const categoryUpdateSchema = z.object(categoryBaseShape).partial();

export const publisherCreateSchema = z.object({
  name: z.string().min(2).max(200),
});

export const publisherUpdateSchema = publisherCreateSchema.partial();

export const userRoleUpdateSchema = z.object({
  role: z.enum(["CUSTOMER", "DEALER", "ADMIN"]),
});

export const dealerPaymentSchema = z.object({
  amount: z.number().positive("Tutar pozitif olmali.").max(9_999_999),
  reference: z
    .string()
    .max(100)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v)),
  note: z
    .string()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

// Adres — isDefault default'u sadece create'te. PATCH'te göndermeyen istek
// silently false'a düşürmemeli (kullanıcı varsayılan adresini koruyabilmeli).
const addressBaseShape = {
  label: nullableString(50),
  fullName: z.string().min(2).max(200),
  phone: trPhoneSchema,
  city: z.string().min(2).max(50),
  district: z.string().min(1).max(50),
  postalCode: nullableString(20),
  addressLine: z.string().min(5).max(500),
  isDefault: z.boolean(),
};
const addressBaseSchema = z.object({
  ...addressBaseShape,
  isDefault: addressBaseShape.isDefault.optional().default(false),
});

export const addressSchema = addressBaseSchema.refine(
  (v) => isValidLocation(v.city, v.district),
  { message: "Il/ilce listesi disinda bir deger.", path: ["city"] }
);

export const addressUpdateSchema = z.object(addressBaseShape).partial().refine(
  (v) => {
    // PATCH'de city/district birlikte gelirse kontrol et; sadece biri gelirse
    // mevcut DB degeri ile eslesemiyor olabilir, geciktirme — endpoint
    // tarafinda merge sonrasi kontrol et.
    if (v.city && v.district) return isValidLocation(v.city, v.district);
    if (v.city) return isValidLocation(v.city);
    return true;
  },
  { message: "Il/ilce listesi disinda bir deger.", path: ["city"] }
);

export const dealerAdjustmentSchema = z.object({
  amount: z
    .number()
    .min(-9_999_999)
    .max(9_999_999)
    .refine((v) => v !== 0, "Tutar sifir olamaz."),
  note: z.string().min(1).max(500),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: optionalTrPhoneSchema,
  email: z.email().toLowerCase(),
  // Email değişiyorsa current password zorunlu (account takeover engeli).
  // Endpoint tarafında runtime kontrol yapılır — şema sadece varlığını kabul eder.
  currentPassword: z.string().min(1).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8, "Sifre en az 8 karakter olmalidir.")
      .max(128)
      .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
        message: "Yeni sifre en az bir harf ve bir rakam icermelidir.",
      }),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "Yeni sifre mevcut sifre ile ayni olamaz.",
    path: ["newPassword"],
  });

export const contactFormSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.email().toLowerCase(),
  phone: optionalTrPhoneSchema,
  subject: z.string().min(2).max(200),
  message: z.string().min(10).max(2000),
});

export function flattenZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "form"}: ${i.message}`)
    .join("; ");
}
