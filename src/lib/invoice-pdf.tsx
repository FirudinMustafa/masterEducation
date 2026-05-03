/* eslint-disable @typescript-eslint/no-require-imports */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import * as fs from "fs";
import * as path from "path";
import type { InvoiceOrder } from "@/components/invoice-view";
import React from "react";

// Türkçe karakter desteği için sistem default font'u (Helvetica) yetersiz —
// Inter veya Noto Sans gibi açık kaynak bir TTF fontu register edelim. Eğer
// public/fonts altında yoksa, sistem fallback ile Latin-1 karakterler işler
// ama "ı, ş, ğ" eksik olabilir. node_modules'dan @react-pdf/renderer'ın gelen
// font'una güvenmiyoruz çünkü Türkçe latin-ext yok.

// Bizim çözümümüz: bir Inter-Regular.ttf'i public/fonts'a koymak yerine,
// font'u runtime'da node_modules'dan çekip register etmek. Eğer bulunamazsa
// fallback Helvetica (Türkçe karakterleri kaybeder).

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  try {
    // Try to find a TTF font in node_modules — Next.js'in built-in Inter font'u
    // .woff2 olduğu için PDF için kullanılmaz. Onun yerine common bir TTF arar.
    const candidates = [
      "C:/Windows/Fonts/calibri.ttf",
      "C:/Windows/Fonts/Calibri.ttf",
      "C:/Windows/Fonts/arial.ttf",
      "C:/Windows/Fonts/Arial.ttf",
    ];
    const fontPath = candidates.find((c) => fs.existsSync(c));
    if (fontPath) {
      Font.register({
        family: "TR",
        fonts: [
          { src: fontPath, fontWeight: "normal" },
        ],
      });
      // Bold variant — calibrib.ttf veya arialbd.ttf
      const boldCandidates = [
        "C:/Windows/Fonts/calibrib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
      ];
      const boldPath = boldCandidates.find((c) => fs.existsSync(c));
      if (boldPath) {
        Font.register({
          family: "TR",
          fonts: [
            { src: fontPath, fontWeight: "normal" },
            { src: boldPath, fontWeight: "bold" },
          ],
        });
      }
      fontsRegistered = true;
    }
  } catch {
    // Sessizce yut — sistem fontuna düş
  }
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "TR",
    fontSize: 10,
    color: "#0F0F0F",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: "#F5B800",
    borderBottomStyle: "solid",
  },
  brandBox: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 90, height: 49, objectFit: "contain" },
  brandName: { fontSize: 16, fontWeight: "bold", color: "#0F0F0F" },
  brandTag: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  invoiceMeta: { textAlign: "right" },
  invoiceLabel: {
    fontSize: 8,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  invoiceNumber: { fontSize: 14, fontWeight: "bold" },
  invoiceDate: { fontSize: 9, color: "#6B7280", marginTop: 2 },
  twoCol: { flexDirection: "row", gap: 14, marginBottom: 22 },
  col: { flex: 1, padding: 12, backgroundColor: "#FAFAF8", borderRadius: 6 },
  colTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 5,
  },
  colLine: { fontSize: 9, marginBottom: 2 },
  table: { borderWidth: 1, borderColor: "#E5E5E0", borderStyle: "solid", borderRadius: 4, overflow: "hidden" },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#F5B800",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  th: { fontSize: 9, fontWeight: "bold", color: "#0F0F0F" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDE8",
    borderBottomStyle: "solid",
  },
  tableRowZebra: { backgroundColor: "#FAFAF8" },
  td: { fontSize: 9 },
  tdRight: { fontSize: 9, textAlign: "right" },
  totals: {
    marginTop: 12,
    marginLeft: "auto",
    width: "45%",
    padding: 12,
    backgroundColor: "#FAFAF8",
    borderRadius: 4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalLabel: { fontSize: 9, color: "#6B7280" },
  totalValue: { fontSize: 9 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: "#0F0F0F",
    borderTopStyle: "solid",
  },
  grandLabel: { fontSize: 11, fontWeight: "bold" },
  grandValue: { fontSize: 12, fontWeight: "bold" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: "#6B7280",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0EDE8",
    borderTopStyle: "solid",
  },
});

const PAYMENT_LABEL: Record<string, string> = {
  CREDIT_CARD: "Kredi Karti",
  OPEN_ACCOUNT: "Acik Hesap",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onaylandi",
  PROCESSING: "Hazirlaniyor",
  SHIPPED: "Kargoda",
  DELIVERED: "Teslim Edildi",
  CANCELLED: "Iptal",
};

function formatCurrency(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL";
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("tr-TR");
}

interface Props {
  order: InvoiceOrder;
}

function loadLogoBuffer(): Buffer | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "me-logo-v2.png");
    return fs.readFileSync(logoPath);
  } catch {
    return null;
  }
}

function InvoiceDocument({ order, logoBuf }: Props & { logoBuf: Buffer | null }) {
  return (
    <Document
      author="Master Education"
      title={`Siparis ${order.orderNumber}`}
      creator="Master Education"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBox}>
            {logoBuf && <Image style={styles.logo} src={logoBuf} />}
            <View>
              <Text style={styles.brandName}>MASTER EDUCATION</Text>
              <Text style={styles.brandTag}>Egitim Materyalleri</Text>
            </View>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceLabel}>Siparis No</Text>
            <Text style={styles.invoiceNumber}>{order.orderNumber}</Text>
            <Text style={styles.invoiceDate}>{formatDate(order.createdAt)}</Text>
            <Text style={styles.invoiceDate}>
              Durum: {STATUS_LABEL[order.status] ?? order.status}
            </Text>
          </View>
        </View>

        {/* Two columns: customer + shipping */}
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <Text style={styles.colTitle}>Musteri</Text>
            <Text style={styles.colLine}>
              {order.dealer ? order.dealer.companyName : order.shippingName}
            </Text>
            <Text style={styles.colLine}>{order.customerEmail}</Text>
            {order.dealer && (
              <>
                <Text style={styles.colLine}>VKN: {order.dealer.taxNumber}</Text>
                <Text style={styles.colLine}>VD: {order.dealer.taxOffice}</Text>
              </>
            )}
          </View>
          <View style={styles.col}>
            <Text style={styles.colTitle}>Teslimat</Text>
            <Text style={styles.colLine}>{order.shippingName}</Text>
            <Text style={styles.colLine}>{order.shippingAddress}</Text>
            <Text style={styles.colLine}>{order.shippingCity}</Text>
            {order.shippingPhone && <Text style={styles.colLine}>{order.shippingPhone}</Text>}
            <Text style={styles.colLine}>
              Odeme: {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
            </Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 4 }]}>Urun</Text>
            <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Adet</Text>
            <Text style={[styles.th, { flex: 1.4, textAlign: "right" }]}>Birim</Text>
            <Text style={[styles.th, { flex: 0.7, textAlign: "right" }]}>KDV</Text>
            <Text style={[styles.th, { flex: 1.4, textAlign: "right" }]}>Tutar</Text>
          </View>
          {order.items.map((item, i) => (
            <View
              key={item.id}
              style={[styles.tableRow, ...(i % 2 === 1 ? [styles.tableRowZebra] : [])]}
            >
              <View style={{ flex: 4 }}>
                <Text style={styles.td}>{item.productName}</Text>
                {item.productSku && (
                  <Text style={[styles.td, { fontSize: 8, color: "#6B7280", marginTop: 1 }]}>
                    ISBN: {item.productSku}
                  </Text>
                )}
              </View>
              <Text style={[styles.tdRight, { flex: 1 }]}>{item.quantity}</Text>
              <Text style={[styles.tdRight, { flex: 1.4 }]}>
                {formatCurrency(Number(item.unitPrice))}
              </Text>
              <Text style={[styles.tdRight, { flex: 0.7 }]}>
                %{item.vatRate ?? 0}
              </Text>
              <Text style={[styles.tdRight, { flex: 1.4, fontWeight: "bold" }]}>
                {formatCurrency(Number(item.lineTotal))}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Ara Toplam</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.subtotal)}</Text>
          </View>
          {order.discountTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Indirim</Text>
              <Text style={[styles.totalValue, { color: "#16A34A" }]}>
                -{formatCurrency(order.discountTotal)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>KDV</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.vatTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Kargo</Text>
            <Text style={styles.totalValue}>
              {order.shippingCost === 0 ? "Ucretsiz" : formatCurrency(order.shippingCost)}
            </Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Genel Toplam</Text>
            <Text style={styles.grandValue}>{formatCurrency(order.total)}</Text>
          </View>
        </View>

        {/* Note */}
        {order.note && (
          <View style={{ marginTop: 18, padding: 10, backgroundColor: "#FFFBEB", borderRadius: 4 }}>
            <Text style={[styles.colTitle, { color: "#92400E" }]}>Not</Text>
            <Text style={{ fontSize: 9, color: "#92400E" }}>{order.note}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          Master Education · info@mastereducation.com.tr · 0 539 411 65 95 · mastereducation.com.tr
        </Text>
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(order: InvoiceOrder): Promise<Buffer> {
  ensureFonts();
  const logoBuf = loadLogoBuffer();
  const doc = <InvoiceDocument order={order} logoBuf={logoBuf} />;
  return await renderToBuffer(doc);
}
