import { describe, it, expect } from "vitest";
import {
  registerSchema,
  dealerApplySchema,
  addressSchema,
  profileUpdateSchema,
  contactFormSchema,
  orderCreateSchema,
} from "@/lib/validations";

/**
 * Faz 19 — Pre-prod kararları regression.
 *
 * #1 Order status state machine: integration testte kontrol edilir
 *    (whitelist API gate'inde, schema'da değil)
 * #2 Doc state machine: integration testte
 * #3 TR phone normalization (bu dosyada)
 * #5 0 TL ürün checkout engeli: integration testte
 */

describe("Faz 19.3 — TR telefon doğrulama", () => {
  // Geçerli formatlar — hepsi normalize sonrası 10 hane
  const validForms = [
    "05551234567",        // 11 hane (0 ile)
    "5551234567",         // 10 hane (0 yok)
    "0555 123 45 67",     // boşluk
    "0555-123-45-67",     // tire
    "+90 555 123 45 67",  // +90
    "+905551234567",      // +90 boşluksuz
    "00905551234567",     // 0090
    "905551234567",       // 90 (12 hane)
    "(0532) 111 22 33",   // paren
    "02121234567",        // sabit (2 ile başlayan)
  ];

  for (const phone of validForms) {
    it(`registerSchema kabul: "${phone}"`, () => {
      const r = registerSchema.parse({
        name: "Test",
        email: "test@test.com",
        password: "Pwd12345",
        phone,
        termsAccepted: true,
      });
      expect(r.phone).toMatch(/^[2-5]\d{9}$/);
    });
  }

  // Geçersiz formatlar
  const invalidForms = [
    "123456",         // çok kısa
    "111",            // çok kısa
    "+1234567890",    // ABD numarası (1 ile başlıyor)
    "abcdefghij",     // harf
    "11111111111",    // 1 ile başlayan
    "61234567890",    // 6 ile başlayan
    "9551234567",     // 9 ile başlayan (ama 90 prefix değil — 10 hane)
  ];

  for (const phone of invalidForms) {
    it(`dealerApplySchema reddediyor: "${phone}"`, () => {
      const r = dealerApplySchema.safeParse({
        name: "Test",
        email: "test@test.com",
        phone,
        password: "Pwd12345",
        companyName: "Test Co",
        taxOffice: "Kadıköy",
        taxNumber: "1234567890",
        city: "İstanbul",
        district: "Kadıköy",
        addressLine: "Test cd 5",
        termsAccepted: true,
      });
      expect(r.success).toBe(false);
    });
  }

  it("optional phone — boş string → null", () => {
    const r = registerSchema.parse({
      name: "Test",
      email: "test@test.com",
      password: "Pwd12345",
      phone: "",
      termsAccepted: true,
    });
    expect(r.phone).toBeNull();
  });

  it("optional phone — yok → null", () => {
    const r = registerSchema.parse({
      name: "Test",
      email: "test@test.com",
      password: "Pwd12345",
      termsAccepted: true,
    });
    expect(r.phone).toBeNull();
  });

  it("address phone (zorunlu) — geçerli kabul", () => {
    const r = addressSchema.parse({
      fullName: "Ali Veli",
      phone: "0532 111 22 33",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Test cd 5",
    });
    expect(r.phone).toBe("5321112233");
  });

  it("contact form phone (opsiyonel) — boş null'a düşer", () => {
    const r = contactFormSchema.parse({
      name: "Ali Veli",
      email: "ali@test.com",
      subject: "Test",
      message: "Test mesaji uzun",
      phone: "",
    });
    expect(r.phone).toBeNull();
  });

  it("profileUpdateSchema phone normalize", () => {
    const r = profileUpdateSchema.parse({
      name: "Ali Veli",
      email: "a@b.com",
      phone: "0532 111 22 33",
    });
    expect(r.phone).toBe("5321112233");
  });

  it("order shipping phone normalize", () => {
    const r = orderCreateSchema.parse({
      items: [{ productId: "p1", quantity: 1 }],
      shipping: {
        fullName: "Ali",
        email: "ali@test.com",
        phone: "+90 532 111 22 33",
        city: "İstanbul",
        district: "Kadıköy",
        address: "Test cd 5",
      },
      paymentMethod: "CREDIT_CARD",
      contractsAccepted: true,
    });
    expect(r.shipping.phone).toBe("5321112233");
  });
});
