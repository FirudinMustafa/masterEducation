import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";

/**
 * Master Education markali Excel dosyalari icin ortak yardimci.
 * Logo + renk + font + footer her template'te tutarli çıkar.
 */

// Brand palette (globals.css ile senkron)
export const BRAND = {
  gold: "FFF5B800",
  goldDark: "FFD4A000",
  goldLight: "FFFDE68A",
  black: "FF0F0F0F",
  offWhite: "FFFAFAF8",
  warmGray: "FFF0EDE8",
  softGray: "FFE8E5DF",
  textMid: "FF6B6B6B",
};

const BRAND_NAME = "Master Education";
const BRAND_CONTACT = "info@mastereducation.com.tr  ·  0 539 411 65 95  ·  mastereducation.com.tr";

let cachedLogo: ArrayBuffer | null = null;

function loadLogoBuffer(): ArrayBuffer | null {
  if (cachedLogo) return cachedLogo;
  const logoPath = path.join(process.cwd(), "public", "me-logo-v2.png");
  try {
    const buf = fs.readFileSync(logoPath);
    cachedLogo = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return cachedLogo;
  } catch {
    return null;
  }
}

export interface BrandedSheetOptions {
  title: string;
  subtitle?: string;
  columns: Array<{
    header: string;
    key: string;
    width?: number;
    /** Hucre bicimi (ornek: '#,##0.00', '0%', 'dd/mm/yyyy') */
    numFmt?: string;
  }>;
  /** Baslik satirinin altina renkli bir ozet paragrafi koy. */
  intro?: string;
}

/**
 * Marka font + kenarlik tutarligi icin fabrika — her hucreye ayni kiralari
 * tekrar yazmamak amaciyla.
 */
export function createBrandedWorkbook(creator = BRAND_NAME): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.lastModifiedBy = creator;
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/**
 * Bir worksheet'e marka baslik satirlarini + kolonlari kurar ve
 * icerige baslanacak satir numarasini dondurur.
 *
 * Layout:
 *   Satir 1-5  : logo + marka adi + alt baslik
 *   Satir 6    : (opsiyonel) giriş metni
 *   Satir 7    : kolon basliklari (gold background)
 *   Satir 8+   : veri
 */
export function setupBrandedSheet(
  sheet: ExcelJS.Worksheet,
  opts: BrandedSheetOptions,
): { dataStartRow: number } {
  const wb = sheet.workbook;
  const totalCols = opts.columns.length;
  const lastColLetter = sheet.getColumn(totalCols).letter;

  // Default satir yukseklikleri — logo 55px (~41pt) sığsin diye row 1
  // genişletildi. Boylelikle logo asagidaki "Master Education" textine
  // çakışmaz. row 2 brand title, row 3 subtitle, row 4 ince renkli ayraç.
  sheet.getRow(1).height = 44;
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 18;
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 8;

  // ─ Logo ─
  // Logo aspect 804×438 (~1.835:1). A column'un genisligi default 18 unit ≈
  // 130px; logo'yu 100×55 yaparak A1 cell'i icine sigdiriyoruz — B1'deki
  // marka adi text'ine tasmasin.
  const logoBuf = loadLogoBuffer();
  if (logoBuf) {
    const imageId = wb.addImage({ buffer: logoBuf, extension: "png" });
    sheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 100, height: 55 },
      editAs: "oneCell",
    });
  }

  // ─ Marka adi ─
  sheet.mergeCells(`B1:${lastColLetter}1`);
  const brandCell = sheet.getCell("B1");
  brandCell.value = BRAND_NAME;
  brandCell.font = { name: "Calibri", size: 18, bold: true, color: { argb: BRAND.black } };
  brandCell.alignment = { vertical: "middle", horizontal: "left" };

  // ─ Title ─
  sheet.mergeCells(`B2:${lastColLetter}2`);
  const titleCell = sheet.getCell("B2");
  titleCell.value = opts.title;
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND.goldDark } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  // ─ Subtitle (ornek: "Musteri: XYZ · Tarih: 24.04.2026") ─
  sheet.mergeCells(`B3:${lastColLetter}3`);
  const subCell = sheet.getCell("B3");
  subCell.value =
    opts.subtitle ??
    `Oluşturma tarihi: ${new Date().toLocaleDateString("tr-TR")}`;
  subCell.font = { name: "Calibri", size: 10, color: { argb: BRAND.textMid } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };

  // ─ Gold separator (satir 4) ─
  for (let c = 1; c <= totalCols; c++) {
    const cell = sheet.getRow(4).getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.gold },
    };
  }

  let cursor = 5;

  // ─ Intro metni (opsiyonel) ─
  if (opts.intro) {
    sheet.getRow(cursor).height = 30;
    sheet.mergeCells(`A${cursor}:${lastColLetter}${cursor}`);
    const introCell = sheet.getCell(`A${cursor}`);
    introCell.value = opts.intro;
    introCell.font = { name: "Calibri", size: 10, color: { argb: BRAND.black } };
    introCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    introCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.offWhite },
    };
    cursor++;
  }

  // ─ Kolon basliklari ─
  // sheet.columns = [...{header}] kullanildiginda ExcelJS basliklari row 1'e
  // yazip bizim marka bolumumuzu ezer. Bu yuzden headerless sekilde sadece
  // width + key + style set edip basliklari cursor satirina elle yaziyoruz.
  opts.columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = c.width ?? 18;
    col.key = c.key;
    if (c.numFmt) col.numFmt = c.numFmt;
  });

  const headerRow = sheet.getRow(cursor);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND.black } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: BRAND.gold },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "medium", color: { argb: BRAND.goldDark } },
    };
  });
  headerRow.height = 22;

  return { dataStartRow: cursor + 1 };
}

/**
 * Veri satirlarini ekler. setupBrandedSheet sonrasi cagrilir. Eksik alanlari
 * bos string olarak yazar.
 */
export function appendBrandedRows<T extends Record<string, unknown>>(
  sheet: ExcelJS.Worksheet,
  rows: T[],
  options: { zebra?: boolean } = { zebra: true },
): void {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = sheet.addRow(r);
    row.font = { name: "Calibri", size: 10 };
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "left" };
      cell.border = {
        bottom: { style: "thin", color: { argb: BRAND.softGray } },
      };
      if (options.zebra && i % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: BRAND.offWhite },
        };
      }
    });
  }
}

/**
 * Sheet'in sonuna marka footer'i ekler (iletişim bilgisi).
 */
export function appendBrandedFooter(sheet: ExcelJS.Worksheet): void {
  const totalCols = sheet.columns.length;
  const lastCol = sheet.getColumn(totalCols).letter;
  const row = sheet.rowCount + 2;
  sheet.mergeCells(`A${row}:${lastCol}${row}`);
  const cell = sheet.getCell(`A${row}`);
  cell.value = BRAND_CONTACT;
  cell.font = { name: "Calibri", size: 9, italic: true, color: { argb: BRAND.textMid } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

/**
 * Tek sefer cagri ile tam bir branded sheet (baslik + intro + header + veri +
 * footer) oluşturmak icin yardimci.
 */
export function buildBrandedSheet<T extends Record<string, unknown>>(
  wb: ExcelJS.Workbook,
  sheetName: string,
  opts: BrandedSheetOptions & { rows: T[] },
): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: opts.intro ? 7 : 6 }],
  });
  setupBrandedSheet(sheet, opts);
  appendBrandedRows(sheet, opts.rows);
  appendBrandedFooter(sheet);
  return sheet;
}

/**
 * Excel response builder.
 *
 * HTTP headerlari Latin-1 kabul eder; Turkce karakterler (s, g, c, u, o, i)
 * Response constructor'da ByteString hatasi firlatir. RFC 5987 'filename*='
 * direktifi ile ASCII filename fallback + UTF-8 ozgun isim verilir.
 *
 * Geriye uyumluluk: utf8Filename verilmezse filename parametresi her iki yere
 * de yazilir (cagrilari kirma).
 */
export function excelResponse(
  buffer: ArrayBuffer,
  filename: string,
  utf8Filename?: string,
): Response {
  const ascii = filename;
  const utf8 = utf8Filename ?? filename;
  const cd = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": cd,
    },
  });
}
