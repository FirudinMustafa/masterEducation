import { describe, it, expect } from "vitest";
import {
  getProvinces,
  getDistricts,
  isValidProvince,
  isValidLocation,
  locationCount,
} from "@/lib/turkey-locations";
import { addressSchema, addressUpdateSchema } from "@/lib/validations";

describe("turkey-locations", () => {
  it("81 il + 900+ ilce", () => {
    const c = locationCount();
    expect(c.provinces).toBe(81);
    expect(c.districts).toBeGreaterThan(900);
  });

  it("alfabetik il sirasi (TR collation)", () => {
    const provinces = getProvinces();
    expect(provinces[0]).toBe("Adana");
    expect(provinces.includes("İstanbul")).toBe(true);
    expect(provinces.at(-1)).toBe("Zonguldak");
  });

  it("Istanbul ilcelerini dondurur", () => {
    const districts = getDistricts("İstanbul");
    expect(districts).toContain("Kadıköy");
    expect(districts).toContain("Beşiktaş");
    expect(districts.length).toBeGreaterThan(30);
  });

  it("bilinmeyen il icin bos liste", () => {
    expect(getDistricts("Atlantis")).toEqual([]);
  });

  it("isValidProvince — case sensitive", () => {
    expect(isValidProvince("İstanbul")).toBe(true);
    expect(isValidProvince("istanbul")).toBe(false);
    expect(isValidProvince("Atlantis")).toBe(false);
  });

  it("isValidLocation — il/ilce eslesmesi", () => {
    expect(isValidLocation("İstanbul", "Kadıköy")).toBe(true);
    expect(isValidLocation("İstanbul", "Çankaya")).toBe(false); // Ankara'da
    expect(isValidLocation("Ankara", "Çankaya")).toBe(true);
  });

  it("isValidLocation — ilcesiz cagri sadece il'i kontrol", () => {
    expect(isValidLocation("İstanbul")).toBe(true);
    expect(isValidLocation("Atlantis")).toBe(false);
  });
});

describe("addressSchema location validation", () => {
  // nullableString helper string | "" | undefined kabul eder; null kabul etmez.
  const baseValid = {
    fullName: "Ali Veli",
    phone: "05551234567",
    city: "İstanbul",
    district: "Kadıköy",
    addressLine: "Atatürk Cad. No:1",
    isDefault: false,
  };

  it("gecerli il/ilce kabul", () => {
    const r = addressSchema.safeParse(baseValid);
    expect(r.success).toBe(true);
  });

  it("yanlis il reddet", () => {
    const r = addressSchema.safeParse({ ...baseValid, city: "Atlantis" });
    expect(r.success).toBe(false);
  });

  it("yanlis ilce (il'e ait degil) reddet", () => {
    const r = addressSchema.safeParse({ ...baseValid, district: "Çankaya" });
    expect(r.success).toBe(false);
  });

  it("partial update — sadece label degisikligi", () => {
    const r = addressUpdateSchema.safeParse({ label: "Ofis" });
    expect(r.success).toBe(true);
  });

  it("partial update — sadece il (ilce gelmedi) listede ise kabul", () => {
    const r = addressUpdateSchema.safeParse({ city: "İstanbul" });
    expect(r.success).toBe(true);
  });

  it("partial update — il+ilce birlikte uyumsuzsa reddet", () => {
    const r = addressUpdateSchema.safeParse({
      city: "İstanbul",
      district: "Çankaya",
    });
    expect(r.success).toBe(false);
  });
});
