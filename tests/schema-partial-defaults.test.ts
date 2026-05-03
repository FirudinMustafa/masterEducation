import { describe, it, expect } from "vitest";
import {
  productCreateSchema,
  productUpdateSchema,
  couponCreateSchema,
  couponUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
} from "@/lib/validations";

/**
 * Faz 18 e2e regression: `.partial()` üzerine bağlı update şemaları
 * `.default(...)` alanlarını silently uyguluyordu — örn. PATCH price
 * gönderince stockQuantity → 0, isPublished → true. Tüm `*UpdateSchema`'ler
 * default'sız base'den türetildi. Bu test ileride aynı tuzağa düşmemizi engelle.
 */
describe("Faz 18 — partial() default leak regression", () => {
  it("productUpdateSchema: omitted field stays undefined (no default leak)", () => {
    const r = productUpdateSchema.parse({ price: 130 });
    expect(r.stockQuantity).toBeUndefined();
    expect(r.vatRate).toBeUndefined();
    expect(r.isPublished).toBeUndefined();
    expect(r.price).toBe(130);
  });

  it("productCreateSchema: defaults still apply on create", () => {
    const r = productCreateSchema.parse({
      name: "Kitap",
      sku: "X1",
      price: 10,
    });
    expect(r.stockQuantity).toBe(0);
    expect(r.vatRate).toBe(0);
    expect(r.isPublished).toBe(true);
  });

  it("couponUpdateSchema: omitted minSubtotal/isActive stay undefined", () => {
    const r = couponUpdateSchema.parse({ code: "BLACK10" });
    expect(r.minSubtotal).toBeUndefined();
    expect(r.isActive).toBeUndefined();
  });

  it("couponCreateSchema: defaults apply on create", () => {
    const r = couponCreateSchema.parse({
      code: "X1",
      kind: "PERCENT",
      value: 10,
    });
    expect(r.minSubtotal).toBe(0);
    expect(r.isActive).toBe(true);
  });

  it("categoryUpdateSchema: omitted type stays undefined", () => {
    const r = categoryUpdateSchema.parse({ name: "Yeni Detay Kat" });
    expect(r.type).toBeUndefined();
  });

  it("categoryCreateSchema: type defaults to ana", () => {
    const r = categoryCreateSchema.parse({ name: "Kat" });
    expect(r.type).toBe("ana");
  });
});
