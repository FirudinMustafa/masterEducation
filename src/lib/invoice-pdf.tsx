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
import { LEGAL_SELLER } from "@/lib/constants";
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
      // Linux (VPS) — DejaVu/Liberation/Noto Türkçe karakterleri destekler
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
      "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
      // Windows (yerel gelistirme)
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
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
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

// Modül yüklenirken bir kez dene; font bulunamazsa @react-pdf'in yerleşik
// Helvetica'sına düş (çökme yerine). Helvetica Türkçe latin-ext sınırlı olsa da
// PDF üretimi hata vermez; sistemde DejaVu varsa (VPS) "TR" tam Türkçe çalışır.
ensureFonts();
const BODY_FONT = fontsRegistered ? "TR" : "Helvetica";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: BODY_FONT,
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
  // Teslim fişi: resmi satıcı kimliği başlığı
  legalTitle: { fontSize: 12, fontWeight: "bold", color: "#0F0F0F", maxWidth: 300 },
  legalLine: { fontSize: 8, color: "#374151", marginTop: 2, maxWidth: 300 },
  // Teslim fişi: araç/şoför bilgileri — elle doldurulacak boş satırlar
  deliveryBox: {
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E5E0",
    borderStyle: "solid",
    borderRadius: 4,
  },
  deliveryRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 8 },
  deliveryLabel: { fontSize: 9, color: "#374151", width: 120 },
  deliveryFill: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#9CA3AF",
    borderBottomStyle: "solid",
    height: 12,
  },
  // Teslim fişi: imza alanı
  signatureRow: { flexDirection: "row", gap: 24, marginTop: 36 },
  signatureBox: { flex: 1 },
  signatureLabel: { fontSize: 9, fontWeight: "bold", color: "#374151", marginBottom: 28 },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: "#374151",
    borderTopStyle: "solid",
    paddingTop: 4,
  },
  signatureHint: { fontSize: 8, color: "#6B7280" },
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
  CANCELLED: "İptal",
};

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("tr-TR");
}

interface Props {
  order: InvoiceOrder;
  /**
   * Teslim fişi modu: başlık resmi satıcı kimliği, araç/şoför/imza alanları
   * eklenir, alt footer kaldırılır. (Fiyat/toplam hiçbir PDF'de gösterilmez.)
   */
  deliverySlip?: boolean;
}

function loadLogoBuffer(): Buffer | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "me-logo-v2.png");
    return fs.readFileSync(logoPath);
  } catch {
    return null;
  }
}

function InvoiceDocument({
  order,
  logoBuf,
  deliverySlip = false,
}: Props & { logoBuf: Buffer | null }) {
  return (
    <Document
      author="Master Education"
      title={
        deliverySlip
          ? `Teslim Fişi ${order.orderNumber}`
          : `Sipariş ${order.orderNumber}`
      }
      creator="Master Education"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          {deliverySlip ? (
            <View style={{ maxWidth: 320 }}>
              <Text style={styles.legalTitle}>{LEGAL_SELLER.title}</Text>
              <Text style={styles.legalLine}>{LEGAL_SELLER.address}</Text>
              <Text style={styles.legalLine}>
                Vergi Dairesi: {LEGAL_SELLER.taxOffice} · VKN: {LEGAL_SELLER.taxNumber}
              </Text>
              <Text style={styles.legalLine}>Tel: {LEGAL_SELLER.phone}</Text>
            </View>
          ) : (
            <View style={styles.brandBox}>
              {logoBuf && <Image style={styles.logo} src={logoBuf} />}
              <View>
                <Text style={styles.brandName}>MASTER EDUCATION</Text>
                <Text style={styles.brandTag}>Eğitim Materyalleri</Text>
              </View>
            </View>
          )}
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceLabel}>
              {deliverySlip ? "Teslim Fişi" : "Sipariş No"}
            </Text>
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
              Ödeme: {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
            </Text>
          </View>
        </View>

        {/* Items table */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, { flex: 4 }]}>Ürün</Text>
            <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Adet</Text>
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
            </View>
          ))}
        </View>

        {/* Fiyat/toplam bölümü bilinçli olarak kaldırıldı — hiçbir PDF'de
            tutar gösterilmez (2026-06-08 talebi). */}

        {/* Note */}
        {order.note && (
          <View style={{ marginTop: 18, padding: 10, backgroundColor: "#FFFBEB", borderRadius: 4 }}>
            <Text style={[styles.colTitle, { color: "#92400E" }]}>Not</Text>
            <Text style={{ fontSize: 9, color: "#92400E" }}>{order.note}</Text>
          </View>
        )}

        {/* Teslim fişi: araç/şoför bilgileri (elle doldurulur) + imza alanı */}
        {deliverySlip && (
          <>
            <View style={styles.deliveryBox}>
              <Text style={[styles.colTitle, { marginBottom: 8 }]}>
                Sevkiyat Bilgileri
              </Text>
              {[
                "Teslim Şekli",
                "Araç Plakası",
                "Dorse Plakası",
                "Şoför Adı Soyadı",
                "Şoför TC No",
              ].map((label) => (
                <View key={label} style={styles.deliveryRow}>
                  <Text style={styles.deliveryLabel}>{label}</Text>
                  <View style={styles.deliveryFill} />
                </View>
              ))}
            </View>

            <View style={styles.signatureRow}>
              <View style={styles.signatureBox}>
                <Text style={styles.signatureLabel}>Teslim Eden</Text>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureHint}>Ad Soyad / İmza</Text>
                </View>
              </View>
              <View style={styles.signatureBox}>
                <Text style={styles.signatureLabel}>Teslim Alan</Text>
                <View style={styles.signatureLine}>
                  <Text style={styles.signatureHint}>Ad Soyad / İmza</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {!deliverySlip && (
          <Text style={styles.footer}>
            Master Education · info@mastereducation.com.tr · 0 539 411 65 95 · mastereducation.com.tr
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function generateInvoicePdf(
  order: InvoiceOrder,
): Promise<Buffer> {
  ensureFonts();
  const logoBuf = loadLogoBuffer();
  const doc = <InvoiceDocument order={order} logoBuf={logoBuf} />;
  return await renderToBuffer(doc);
}

/**
 * Teslim fişi PDF'i — fiyatsız, resmi satıcı kimliği başlığı, araç/şoför/imza
 * alanları, footer'sız. "PDF İndir" (sipariş özeti) ile karıştırılmamalı.
 */
export async function generateDeliverySlipPdf(
  order: InvoiceOrder,
): Promise<Buffer> {
  ensureFonts();
  const logoBuf = loadLogoBuffer();
  const doc = <InvoiceDocument order={order} logoBuf={logoBuf} deliverySlip />;
  return await renderToBuffer(doc);
}
