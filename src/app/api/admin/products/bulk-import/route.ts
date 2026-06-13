import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { slugify } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

/**
 * Admin toplu ürün yükleme.
 *
 *  - `dryRun=1`: Dosyayi parse + validate et, veritabanina dokunma. Preview icin.
 *  - normal:    Tüm satirlar gecerliyse tek transaction'da insert. Bir satir hata
 *               verirse hicbir sey yazilmaz (all-or-nothing).
 *
 * Kolon dogrulamalari ve yayınevi/kategori name → id çevirme burada yapilir.
 * `nopId` tekillik kontrolu DB'den yapilir (unique index'e de takilacak ama
 * preview'da gözukmesi icin).
 */

interface ParsedRow {
  rowIndex: number;
  nopId: number;
  name: string;
  sku: string;
  price: number;
  oldPrice: number | null;
  vatRate: number;
  stockQuantity: number;
  publisherName: string | null;
  categoryName: string | null;
  description: string | null;
  productType: string | null;
  language: string | null;
  discountGroup: string | null;
  nameEn: string | null;
  isPublished: boolean;
}

/**
 * Şablon başlıkları Türkçeleştirildi (2026-06-13). Eski İngilizce başlıklarla
 * geriye dönük uyum için her kanonik alan birden çok başlık varyantını kabul
 * eder. Başlıklar normalize edilir (küçük harf, TR karakter sadeleştirme).
 */
const HEADER_ALIASES: Record<string, string[]> = {
  nopId: ["nopid", "sira no", "sıra no", "no", "urun no", "ürün no"],
  name: ["name", "urun adi", "ürün adı", "ad", "urun"],
  sku: ["sku", "isbn", "barkod", "urun kodu", "ürün kodu"],
  price: ["price", "indirimli fiyat", "fiyat", "satis fiyati"],
  oldPrice: ["oldprice", "ust fiyat", "üst fiyat", "eski fiyat", "liste fiyati"],
  vatRate: ["vatrate", "kdv", "kdv %", "kdv orani"],
  stockQuantity: ["stockquantity", "stok", "stok adedi", "adet"],
  publisher: ["publisher", "yayinevi", "yayınevi"],
  category: ["category", "kategori"],
  description: ["description", "urun aciklamasi", "ürün açıklaması", "aciklama", "açıklama", "anatur"],
  productType: ["producttype", "urun tipi", "ürün tipi", "tip"],
  language: ["language", "dil"],
  discountGroup: ["discountgroup", "iskonto grubu", "iskonto"],
  nameEn: ["nameen", "ingilizce ad"],
  isPublished: ["ispublished", "yayinda", "yayında"],
};

function normalizeHeaderCell(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ");
}

/** Bir başlık hücresini kanonik alan adına çevirir (yoksa null). */
function canonicalHeader(raw: string): string | null {
  const n = normalizeHeaderCell(raw);
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(n)) return canonical;
  }
  return null;
}

interface RowError {
  rowIndex: number;
  errors: string[];
}

function cellStr(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const maybeRich = v as { richText?: { text: string }[]; text?: string };
    if (maybeRich.richText) return maybeRich.richText.map((t) => t.text).join("");
    if (maybeRich.text) return maybeRich.text;
  }
  return String(v).trim();
}

function parseBool(v: ExcelJS.CellValue, defaultVal: boolean): boolean {
  if (v === null || v === undefined || v === "") return defaultVal;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "evet", "yes"].includes(s)) return true;
  if (["false", "0", "hayir", "no"].includes(s)) return false;
  return defaultVal;
}

export async function POST(req: NextRequest) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  // mode=upsert: nopId match olan satırları update, yokları insert.
  // Default insert (geriye dönük uyum).
  const mode = req.nextUrl.searchParams.get("mode") === "upsert" ? "upsert" : "insert";
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Form verisi okunamadi." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Dosya 10 MB sinirini asiyor." },
      { status: 400 }
    );
  }

  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return NextResponse.json(
      { error: "Excel dosyasi okunamadi." },
      { status: 400 }
    );
  }

  const sheet = wb.getWorksheet("Ürünler") ?? wb.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "'Ürünler' sayfasi bulunamadi." }, { status: 400 });
  }

  // Header auto-detect (branded template row 6-7, clean template row 1).
  // Başlıklar Türkçe veya eski İngilizce olabilir; canonicalHeader() ile
  // kanonik alan adına normalize edilir.
  let headerRowNum = -1;
  // Sütun index'i → kanonik alan adı (eşleşmeyen sütunlar null).
  let headers: (string | null)[] = [];
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const candidate: (string | null)[] = [];
    sheet.getRow(r).eachCell((cell, col) => {
      candidate[col - 1] = canonicalHeader(cellStr(cell.value));
    });
    if (
      candidate.includes("nopId") &&
      candidate.includes("name") &&
      candidate.includes("sku")
    ) {
      headerRowNum = r;
      headers = candidate;
      break;
    }
  }
  if (headerRowNum < 0) {
    return NextResponse.json(
      { error: "Basliklarda 'Sıra No', 'Ürün Adı', 'ISBN' (veya eski 'nopId', 'name', 'sku/isbn') zorunlu (ilk 15 satirda bulunamadi)." },
      { status: 400 }
    );
  }

  const idx = (name: string) => headers.indexOf(name);
  const cols = {
    nopId: idx("nopId"),
    name: idx("name"),
    sku: idx("sku"),
    price: idx("price"),
    oldPrice: idx("oldPrice"),
    vatRate: idx("vatRate"),
    stockQuantity: idx("stockQuantity"),
    publisher: idx("publisher"),
    category: idx("category"),
    description: idx("description"),
    productType: idx("productType"),
    language: idx("language"),
    discountGroup: idx("discountGroup"),
    nameEn: idx("nameEn"),
    isPublished: idx("isPublished"),
  };

  if (cols.price < 0) {
    return NextResponse.json(
      { error: "'price' basligi zorunlu." },
      { status: 400 }
    );
  }

  // Lookup maps
  const [publishers, categories, existingNopIds, existingSkus] = await Promise.all([
    prisma.publisher.findMany(),
    prisma.category.findMany(),
    prisma.product.findMany({ select: { nopId: true } }),
    prisma.product.findMany({ select: { sku: true } }),
  ]);
  const pubByName = new Map(publishers.map((p) => [p.name.toLowerCase(), p]));
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const nopIdSet = new Set(existingNopIds.map((p) => p.nopId));
  const skuSet = new Set(existingSkus.map((p) => p.sku));

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seenNopIdsInFile = new Set<number>();
  const seenSkusInFile = new Set<string>();

  for (let rn = headerRowNum + 1; rn <= sheet.rowCount; rn++) {
    const row = sheet.getRow(rn);
    const nopIdRaw = cellStr(row.getCell(cols.nopId + 1).value);
    if (!nopIdRaw) continue; // bos satir

    // Branded footer'da nopId hucresi "info@..." gibi merged bir yazi olur.
    // Parse edilemeyen nopId'leri (footer / ornek açıklama) sessizce atla.
    const nopId = Number(nopIdRaw);
    if (!Number.isInteger(nopId) || nopId <= 0) continue;

    const rowErrors: string[] = [];
    const name = cellStr(row.getCell(cols.name + 1).value);
    const sku = cellStr(row.getCell(cols.sku + 1).value);
    const price = Number(cellStr(row.getCell(cols.price + 1).value));
    const oldPriceStr = cols.oldPrice >= 0 ? cellStr(row.getCell(cols.oldPrice + 1).value) : "";
    const oldPrice = oldPriceStr ? Number(oldPriceStr) : null;
    const vatRateStr = cols.vatRate >= 0 ? cellStr(row.getCell(cols.vatRate + 1).value) : "";
    const vatRate = vatRateStr ? Number(vatRateStr) : 0;
    const stockStr = cols.stockQuantity >= 0 ? cellStr(row.getCell(cols.stockQuantity + 1).value) : "";
    const stockQuantity = stockStr ? Number(stockStr) : 0;
    const publisherName = cols.publisher >= 0 ? cellStr(row.getCell(cols.publisher + 1).value) : "";
    const categoryName = cols.category >= 0 ? cellStr(row.getCell(cols.category + 1).value) : "";
    const isPublished = cols.isPublished >= 0
      ? parseBool(row.getCell(cols.isPublished + 1).value, true)
      : true;

    if (!name) rowErrors.push("name bos olamaz.");
    if (!sku) rowErrors.push("sku bos olamaz.");
    if (!Number.isFinite(price) || price < 0) rowErrors.push("price gecerli bir sayı olmali.");
    if (oldPrice !== null && (!Number.isFinite(oldPrice) || oldPrice < 0)) rowErrors.push("oldPrice gecersiz.");
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) rowErrors.push("vatRate 0-100 arasi olmali.");
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) rowErrors.push("stockQuantity tamsayi olmali.");

    // Upsert modunda DB'de var olması hata değil (update yapılacak); sadece
    // dosya içi duplicate hata.
    if (mode === "insert" && nopIdSet.has(nopId))
      rowErrors.push(`nopId ${nopId} zaten DB'de var.`);
    if (seenNopIdsInFile.has(nopId))
      rowErrors.push(`nopId ${nopId} dosyada birden fazla kez kullanilmis.`);
    if (mode === "insert" && skuSet.has(sku))
      rowErrors.push(`sku '${sku}' zaten DB'de var.`);
    if (seenSkusInFile.has(sku))
      rowErrors.push(`sku '${sku}' dosyada birden fazla kez kullanilmis.`);

    if (publisherName && !pubByName.has(publisherName.toLowerCase())) {
      rowErrors.push(`Yayınevi bulunamadi: '${publisherName}'`);
    }
    if (categoryName && !catByName.has(categoryName.toLowerCase())) {
      rowErrors.push(`Kategori bulunamadi: '${categoryName}'`);
    }

    if (rowErrors.length > 0) {
      errors.push({ rowIndex: rn, errors: rowErrors });
      continue;
    }

    seenNopIdsInFile.add(nopId);
    seenSkusInFile.add(sku);

    rows.push({
      rowIndex: rn,
      nopId,
      name,
      sku,
      price,
      oldPrice,
      vatRate,
      stockQuantity,
      publisherName: publisherName || null,
      categoryName: categoryName || null,
      description: cols.description >= 0 ? cellStr(row.getCell(cols.description + 1).value) || null : null,
      productType: cols.productType >= 0 ? cellStr(row.getCell(cols.productType + 1).value) || null : null,
      language: cols.language >= 0 ? cellStr(row.getCell(cols.language + 1).value) || null : null,
      discountGroup: cols.discountGroup >= 0 ? cellStr(row.getCell(cols.discountGroup + 1).value) || null : null,
      nameEn: cols.nameEn >= 0 ? cellStr(row.getCell(cols.nameEn + 1).value) || null : null,
      isPublished,
    });
  }

  // Upsert mode'da kaç satır insert / update olacak — preview için ayrıştır.
  const willUpdate = mode === "upsert"
    ? rows.filter((r) => nopIdSet.has(r.nopId)).length
    : 0;
  const willInsert = rows.length - willUpdate;

  if (dryRun) {
    return NextResponse.json({
      ok: errors.length === 0,
      parsedCount: rows.length,
      errorCount: errors.length,
      mode,
      willInsert,
      willUpdate,
      errors,
      preview: rows.slice(0, 20).map((r) => ({
        rowIndex: r.rowIndex,
        nopId: r.nopId,
        name: r.name,
        sku: r.sku,
        price: r.price,
        publisher: r.publisherName,
        category: r.categoryName,
        action: mode === "upsert" && nopIdSet.has(r.nopId) ? "update" : "insert",
      })),
    });
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Bazi satirlarda hata var, duzeltip tekrar deneyin.", errors, parsedCount: rows.length },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Isleme alinacak satir yok." }, { status: 400 });
  }

  // Slug collision icin dosya ici benzersiz hale getir
  const slugCounts = new Map<string, number>();
  const dataToInsert = rows.map((r) => {
    const base = slugify(r.name) || `ürün-${r.nopId}`;
    const count = slugCounts.get(base) ?? 0;
    slugCounts.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count + 1}`;

    const publisherId = r.publisherName
      ? pubByName.get(r.publisherName.toLowerCase())!.id
      : null;
    const categoryId = r.categoryName
      ? catByName.get(r.categoryName.toLowerCase())!.id
      : null;

    return {
      nopId: r.nopId,
      name: r.name,
      nameEn: r.nameEn,
      slug,
      sku: r.sku,
      price: r.price,
      oldPrice: r.oldPrice,
      vatRate: r.vatRate,
      stockQuantity: r.stockQuantity,
      publisherId,
      categoryId,
      description: r.description,
      productType: r.productType,
      language: r.language,
      discountGroup: r.discountGroup,
      isPublished: r.isPublished,
      hasImage: false,
    };
  });

  // INSERT mode: tek createMany. UPSERT mode: nopId match olanlar update,
  // diğerleri insert. Slug çakışması olabilir → tx içinde upsertler tek tek.
  if (mode === "insert") {
    const result = await prisma
      .$transaction(async (tx) => {
        const created = await tx.product.createMany({ data: dataToInsert });
        return created;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        return { error: msg };
      });

    if ("error" in result) {
      return NextResponse.json(
        { error: `Insert başarısız: ${result.error}` },
        { status: 500 }
      );
    }

    logAudit({
      actorId: gate.session.user.id,
      action: "PRODUCT_BULK_IMPORT",
      entityType: "product",
      entityId: "(bulk)",
      metadata: { mode, count: result.count, fileName: file.name },
    });

    return NextResponse.json({ ok: true, mode, inserted: result.count });
  }

  // UPSERT
  const upsertResult = await prisma
    .$transaction(async (tx) => {
      let inserted = 0;
      let updated = 0;
      for (const d of dataToInsert) {
        if (nopIdSet.has(d.nopId)) {
          // UPDATE: slug ve hasImage gibi alanlara dokunma (mevcut görselleri/slug'ı koru)
          await tx.product.update({
            where: { nopId: d.nopId },
            data: {
              name: d.name,
              nameEn: d.nameEn,
              sku: d.sku,
              price: d.price,
              oldPrice: d.oldPrice,
              vatRate: d.vatRate,
              stockQuantity: d.stockQuantity,
              publisherId: d.publisherId,
              categoryId: d.categoryId,
              description: d.description,
              productType: d.productType,
              language: d.language,
              discountGroup: d.discountGroup,
              isPublished: d.isPublished,
            },
          });
          updated++;
        } else {
          await tx.product.create({ data: d });
          inserted++;
        }
      }
      return { inserted, updated };
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
      return { error: msg };
    });

  if ("error" in upsertResult) {
    return NextResponse.json(
      { error: `Upsert başarısız: ${upsertResult.error}` },
      { status: 500 }
    );
  }

  logAudit({
    actorId: gate.session.user.id,
    action: "PRODUCT_BULK_IMPORT",
    entityType: "product",
    entityId: "(bulk)",
    metadata: {
      mode,
      inserted: upsertResult.inserted,
      updated: upsertResult.updated,
      fileName: file.name,
    },
  });

  return NextResponse.json({
    ok: true,
    mode,
    inserted: upsertResult.inserted,
    updated: upsertResult.updated,
  });
}
