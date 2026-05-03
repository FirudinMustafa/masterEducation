import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { calculateDealerPrice, getDealerDiscountRules } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "DEALER" || !session.user.dealerId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  if (session.user.dealerStatus !== "APPROVED") {
    return NextResponse.json(
      { error: "Bayiliginiz henuz onaylanmamis." },
      { status: 403 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Form verisi okunamadi." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dosya gerekli." }, { status: 400 });
  }
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Excel dosyasi 2MB sinirini asiyor." },
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

  const sheet = wb.getWorksheet("Siparis") ?? wb.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "Sayfa bulunamadi." }, { status: 400 });
  }

  // Branded template'de row 1 marka adi — ilk 15 satirda sku/isbn+quantity
  // (veya adet) iceren satiri baslik kabul ediyoruz. Turkce etiket de kabul.
  // 'sku' ve 'isbn' her ikisi de kabul edilir (geriye donuk uyum).
  let headerRowNum = -1;
  const headers: string[] = [];
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const candidate: string[] = [];
    sheet.getRow(r).eachCell((cell, col) => {
      candidate[col - 1] = String(cell.value ?? "").trim().toLowerCase();
    });
    const hasSku = candidate.includes("sku") || candidate.includes("isbn");
    const hasQty = candidate.includes("quantity") || candidate.includes("adet");
    if (hasSku && hasQty) {
      headerRowNum = r;
      for (let i = 0; i < candidate.length; i++) headers[i] = candidate[i] ?? "";
      break;
    }
  }

  if (headerRowNum < 0) {
    return NextResponse.json(
      { error: "Basliklarda 'isbn' (veya 'sku') ve 'adet' (veya 'quantity') zorunlu." },
      { status: 400 }
    );
  }

  const iSku =
    headers.indexOf("sku") >= 0
      ? headers.indexOf("sku")
      : headers.indexOf("isbn");
  // Desteklenen basliklar: 'quantity' (ingilizce) veya 'adet' (turkce)
  const iQty = headers.indexOf("quantity") >= 0
    ? headers.indexOf("quantity")
    : headers.indexOf("adet");
  const iNote = headers.indexOf("note") >= 0
    ? headers.indexOf("note")
    : headers.indexOf("not (opsiyonel)");

  type ParsedRow = {
    rowIndex: number;
    sku: string;
    quantity: number;
    note: string | null;
  };
  const rows: ParsedRow[] = [];
  const parseErrors: string[] = [];

  for (let rn = headerRowNum + 1; rn <= sheet.rowCount; rn++) {
    const row = sheet.getRow(rn);
    const sku = String(row.getCell(iSku + 1).value ?? "").trim();
    if (!sku) continue;
    const qtyRaw = row.getCell(iQty + 1).value;
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty < 1) {
      // Branded footer / aciklama satiri: gecerli data degil, sessizce atla.
      if (/@|·/.test(sku) && sku.length > 20) continue;
      parseErrors.push(`Satir ${rn}: gecersiz adet.`);
      continue;
    }
    if (qty > 1000) {
      parseErrors.push(`Satir ${rn}: adet 1000'den fazla olamaz.`);
      continue;
    }
    const note =
      iNote >= 0
        ? String(row.getCell(iNote + 1).value ?? "").trim() || null
        : null;
    rows.push({ rowIndex: rn, sku, quantity: qty, note });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Isleme alinacak satir yok.", parseErrors },
      { status: 400 }
    );
  }

  // Collapse duplicate SKUs
  const bySku = new Map<string, ParsedRow>();
  for (const r of rows) {
    const existing = bySku.get(r.sku);
    if (existing) {
      existing.quantity += r.quantity;
    } else {
      bySku.set(r.sku, { ...r });
    }
  }
  const uniqueRows = [...bySku.values()];

  const products = await prisma.product.findMany({
    where: { sku: { in: uniqueRows.map((r) => r.sku) }, isPublished: true },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      vatRate: true,
      stockQuantity: true,
      publisherId: true,
      categoryId: true,
      discountGroup: true,
    },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  const rules = await getDealerDiscountRules(session.user.dealerId);

  interface LineResult {
    sku: string;
    quantity: number;
    productId: string | null;
    productName: string | null;
    unitPrice: number | null;
    lineTotal: number | null;
    ok: boolean;
    error: string | null;
  }

  let subtotal = 0;
  let total = 0;
  const lines: LineResult[] = uniqueRows.map((r) => {
    const product = productBySku.get(r.sku);
    if (!product) {
      return {
        sku: r.sku,
        quantity: r.quantity,
        productId: null,
        productName: null,
        unitPrice: null,
        lineTotal: null,
        ok: false,
        error: "Urun bulunamadi veya yayinda degil.",
      };
    }
    if (product.stockQuantity < r.quantity) {
      return {
        sku: r.sku,
        quantity: r.quantity,
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        lineTotal: null,
        ok: false,
        error: `Stok yetersiz (kalan: ${product.stockQuantity}).`,
      };
    }
    const pricing = calculateDealerPrice(
      {
        id: product.id,
        price: Number(product.price),
        categoryId: product.categoryId,
        publisherId: product.publisherId,
        discountGroup: product.discountGroup,
      },
      rules
    );
    const lineTotal = Math.round(pricing.dealerPrice * r.quantity * 100) / 100;
    const listLine = pricing.listPrice * r.quantity;
    subtotal += listLine;
    total += lineTotal;
    return {
      sku: r.sku,
      quantity: r.quantity,
      productId: product.id,
      productName: product.name,
      unitPrice: pricing.dealerPrice,
      lineTotal,
      ok: true,
      error: null,
    };
  });

  const okCount = lines.filter((l) => l.ok).length;

  return NextResponse.json({
    lines,
    summary: {
      totalRows: uniqueRows.length,
      okRows: okCount,
      failedRows: uniqueRows.length - okCount,
      subtotal: Math.round(subtotal * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
    parseErrors,
  });
}
