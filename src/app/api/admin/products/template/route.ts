import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import {
  createBrandedWorkbook,
  buildBrandedSheet,
  excelResponse,
} from "@/lib/excel-branding";

export async function GET() {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const [publishers, categories] = await Promise.all([
    prisma.publisher.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const wb = createBrandedWorkbook();

  buildBrandedSheet(wb, "Urunler", {
    title: "Toplu Urun Yukleme Sablonu",
    subtitle: `${new Date().toLocaleDateString("tr-TR")}  ·  satir bazli doldurun`,
    intro:
      "Zorunlu alanlar: nopId (benzersiz numara), name, isbn, price. Yayinevi ve kategori REFERANS sayfasindaki isimlerden yazin. Bos alanlari atlayin. price/vatRate/stockQuantity sayisaldir, isPublished TRUE/FALSE. (Eski sablonlardaki 'sku' basligi da kabul edilir.)",
    columns: [
      { header: "nopId", key: "nopId", width: 10, numFmt: "0" },
      { header: "name", key: "name", width: 40 },
      { header: "isbn", key: "sku", width: 20 },
      { header: "price", key: "price", width: 12, numFmt: "#,##0.00" },
      { header: "oldPrice", key: "oldPrice", width: 12, numFmt: "#,##0.00" },
      { header: "vatRate", key: "vatRate", width: 10, numFmt: "0.00" },
      { header: "stockQuantity", key: "stockQuantity", width: 12, numFmt: "0" },
      { header: "publisher", key: "publisher", width: 20 },
      { header: "category", key: "category", width: 20 },
      { header: "anaTur", key: "anaTur", width: 12 },
      { header: "productType", key: "productType", width: 14 },
      { header: "language", key: "language", width: 14 },
      { header: "discountGroup", key: "discountGroup", width: 16 },
      { header: "nameEn", key: "nameEn", width: 36 },
      { header: "isPublished", key: "isPublished", width: 12 },
    ],
    rows: [
      {
        nopId: 900001,
        name: "ORNEK URUN",
        sku: "9780000000001",
        price: 100,
        oldPrice: 120,
        vatRate: 0,
        stockQuantity: 50,
        publisher: publishers[0]?.name ?? "",
        category: categories[0]?.name ?? "",
        anaTur: "ELT",
        productType: "",
        language: "Ingilizce",
        discountGroup: "",
        nameEn: "SAMPLE PRODUCT",
        isPublished: "TRUE",
      },
    ],
  });

  buildBrandedSheet(wb, "Yayinevleri", {
    title: "Yayinevi Referans",
    subtitle: "Bu listedeki isimleri kullanin",
    columns: [
      { header: "name", key: "name", width: 36 },
      { header: "slug", key: "slug", width: 36 },
    ],
    rows: publishers.map((p) => ({ name: p.name, slug: p.slug })),
  });

  buildBrandedSheet(wb, "Kategoriler", {
    title: "Kategori Referans",
    subtitle: "Bu listedeki isimleri kullanin",
    columns: [
      { header: "name", key: "name", width: 30 },
      { header: "slug", key: "slug", width: 30 },
      { header: "type", key: "type", width: 12 },
    ],
    rows: categories.map((c) => ({ name: c.name, slug: c.slug, type: c.type })),
  });

  const buffer = await wb.xlsx.writeBuffer();
  return excelResponse(buffer as ArrayBuffer, "urun-toplu-yukleme-sablon.xlsx");
}
