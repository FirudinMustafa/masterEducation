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

  buildBrandedSheet(wb, "Ürünler", {
    title: "Toplu Ürün Yükleme Sablonu",
    subtitle: `${new Date().toLocaleDateString("tr-TR")}  ·  satir bazli doldurun`,
    intro:
      "Zorunlu alanlar: Sıra No (benzersiz numara), Ürün Adı, ISBN, İndirimli Fiyat. Yayınevi ve Kategori REFERANS sayfasindaki isimlerden yazin. Bos alanlari atlayin. Fiyat/KDV/Stok sayısaldir, Yayında TRUE/FALSE. (Eski sablonlardaki İngilizce basliklar da kabul edilir.)",
    columns: [
      { header: "Sıra No", key: "nopId", width: 10, numFmt: "0" },
      { header: "Ürün Adı", key: "name", width: 40 },
      { header: "ISBN", key: "sku", width: 20 },
      { header: "İndirimli Fiyat", key: "price", width: 14, numFmt: "#,##0.00" },
      { header: "Üst Fiyat", key: "oldPrice", width: 12, numFmt: "#,##0.00" },
      { header: "KDV %", key: "vatRate", width: 10, numFmt: "0.00" },
      { header: "Stok", key: "stockQuantity", width: 10, numFmt: "0" },
      { header: "Yayınevi", key: "publisher", width: 20 },
      { header: "Kategori", key: "category", width: 20 },
      { header: "Ürün Tipi", key: "productType", width: 16 },
      { header: "Dil", key: "language", width: 14 },
      { header: "İskonto Grubu", key: "discountGroup", width: 16 },
      { header: "Ürün Açıklaması", key: "description", width: 40 },
      { header: "Yayında", key: "isPublished", width: 10 },
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
        productType: "Ders kitabı",
        language: "İngilizce",
        discountGroup: "",
        description: "Ürün hakkında kısa açıklama.",
        isPublished: "TRUE",
      },
    ],
  });

  buildBrandedSheet(wb, "Yayınevleri", {
    title: "Yayınevi Referans",
    subtitle: "Bu listedeki isimleri kullanin",
    columns: [
      { header: "Yayınevi Adı", key: "name", width: 36 },
      { header: "Slug", key: "slug", width: 36 },
    ],
    rows: publishers.map((p) => ({ name: p.name, slug: p.slug })),
  });

  buildBrandedSheet(wb, "Kategoriler", {
    title: "Kategori Referans",
    subtitle: "Bu listedeki isimleri kullanin",
    columns: [
      { header: "Kategori Adı", key: "name", width: 30 },
      { header: "Slug", key: "slug", width: 30 },
      { header: "Tip", key: "type", width: 12 },
    ],
    rows: categories.map((c) => ({ name: c.name, slug: c.slug, type: c.type })),
  });

  const buffer = await wb.xlsx.writeBuffer();
  return excelResponse(
    buffer as ArrayBuffer,
    "urun-toplu-yukleme-sablon.xlsx",
    "ürün-toplu-yükleme-şablon.xlsx",
  );
}
