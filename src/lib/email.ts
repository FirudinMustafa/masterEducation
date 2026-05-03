import nodemailer, { type Transporter } from "nodemailer";
import type { CargoCarrier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BRAND } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { carrierLabel, carrierTrackingUrl } from "@/lib/cargo-carriers";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

let transporterCache: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporterCache) return transporterCache;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) return null;

  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporterCache;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const from =
    process.env.SMTP_FROM ?? `${BRAND.name} <${BRAND.email}>`;
  const transporter = getTransporter();

  if (!transporter) {
    console.log("[email:dryrun]", payload.to, "—", payload.subject);
    await logEmail(payload, "DRYRUN", null);
    return true;
  }

  try {
    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });
    await logEmail(payload, "SENT", null);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Resend sandbox kısıtlaması: domain doğrulanmamış hesaplarda yalnızca
    // hesap sahibinin email'ine gönderim açık. Diğer adreslerde "550 You can
    // only send testing emails to your own email address" döner.
    // Bu durumda silently DRYRUN'a düş — kullanıcı akışı bozulmasın, sadece
    // log'a düşsün ki admin durumu görsün.
    const isResendSandbox =
      msg.includes("You can only send testing emails") ||
      (msg.includes("550") && msg.includes("verify a domain"));
    if (isResendSandbox) {
      console.warn(
        `[email:resend-sandbox] ${payload.to} — "${payload.subject}" engellendi (domain dogrulanmasi gerek)`
      );
      await logEmail(
        payload,
        "DRYRUN_SANDBOX",
        "Resend sandbox kisitlamasi — domain dogrulayin"
      );
      return true; // sessizce başarılı say — UX kırılmasın
    }

    console.error("[email:error]", payload.to, msg);
    await logEmail(payload, "FAILED", msg);
    return false;
  }
}

/**
 * Fire-and-forget helper. Email delivery should not block request responses
 * or throw. Use inside `after()` for best behavior on serverless.
 */
export function queueEmail(payload: EmailPayload): void {
  void sendEmail(payload).catch((err) => {
    console.error("[email:queue-error]", payload.to, err);
  });
}

async function logEmail(
  payload: EmailPayload,
  status: string,
  error: string | null
) {
  try {
    await prisma.emailLog.create({
      data: {
        to: payload.to,
        subject: payload.subject,
        status,
        error,
      },
    });
  } catch (err) {
    console.error("[email:logfail]", err);
  }
}

// ─── Email design system ─────────────────────────────────────────
// Inline CSS — mail clientlari (Gmail, Outlook, Apple Mail) external
// stylesheet'i tutarsiz isler. Table-based layout maximum uyum saglar.

const C = {
  black: "#0F0F0F",
  gold: "#F5B800",
  goldDark: "#B88600",
  goldLight: "#FFF7DC",
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  borderSoft: "#F3F4F6",
  surface: "#FFFFFF",
  bg: "#F4F5F7",
  success: "#059669",
  successBg: "#ECFDF5",
  rose: "#E11D48",
  roseBg: "#FFF1F2",
  sky: "#0284C7",
  skyBg: "#EFF6FF",
};

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

function logoUrl(): string {
  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  return `${base}/me-logo-v2.png`;
}

/**
 * HTML escape — email template'lerinde kullanıcı kontrollü alanlar (ad,
 * sirket adi, urun adi, vs.) `dangerouslySetInnerHTML` ekvivalentinde raw
 * interpolation yapılmaktaydı. Saldırgan order create'te shippingName'e
 * `<img src=x onerror=...>` koyup admin/musteri email'inde XSS tetikleyebilir.
 *
 * Sabit/güvenilen string'lere (URL, brand info) gerek yok; ama defensive
 * yaklaşımla wrap() title'ı bile escape edilebilir — bu helper genel kullan.
 */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Premium email layout — table-based, inline-styled, mail-client friendly.
 *
 * Kompozisyon:
 *   1) Header: beyaz arka plan + logo (yatay)
 *   2) Gold accent stripe (4px brand band)
 *   3) Hero: büyük H1 + opsiyonel subtitle
 *   4) Body: çağrılan template'in HTML'i (paragraflar, tablolar, CTA'lar)
 *   5) Footer: koyu arka plan + iletişim + KVKK/iletişim linkleri + © yıl
 *
 * Dark/light mode'da tutarlı görünmesi için sabit renkler. preheader gizli
 * önizleme metni (inbox listesinde subject altında görünen kısa özet).
 */
interface WrapOptions {
  title: string;
  preheader?: string;
  subtitle?: string;
  body: string;
  // Hero icon (emoji veya simgesel) — opsiyonel
  heroAccent?: "gold" | "success" | "rose" | "sky";
}

function wrap(opts: WrapOptions): string {
  const { title, preheader, subtitle, body, heroAccent = "gold" } = opts;
  const accentBg =
    heroAccent === "success"
      ? C.successBg
      : heroAccent === "rose"
        ? C.roseBg
        : heroAccent === "sky"
          ? C.skyBg
          : C.goldLight;
  const accentBar =
    heroAccent === "success"
      ? C.success
      : heroAccent === "rose"
        ? C.rose
        : heroAccent === "sky"
          ? C.sky
          : C.gold;

  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(title)}</title>
  <style>
    /* Outlook + Gmail uyumlu reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: ${C.black}; text-decoration: underline; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
      .hero-title { font-size: 24px !important; line-height: 30px !important; }
      .cta-btn { width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};">
  <!-- Hidden preheader -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader ?? subtitle ?? title)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${C.surface};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,15,15,0.06);">
          <!-- HEADER -->
          <tr>
            <td class="px-mobile" style="padding:24px 32px;border-bottom:1px solid ${C.borderSoft};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle">
                    <a href="${base}" style="text-decoration:none;display:inline-block;">
                      <img src="${logoUrl()}" alt="${escapeHtml(BRAND.name)}" width="160" height="auto" style="display:block;max-width:160px;height:auto;border:0;outline:none;">
                    </a>
                  </td>
                  <td valign="middle" align="right" style="font-family:${FONT};font-size:11px;color:${C.muted};letter-spacing:0.6px;text-transform:uppercase;">
                    Egitimin Tek Adresi
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- GOLD ACCENT STRIPE -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${C.gold} 0%,#FFD566 50%,${C.goldDark} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- HERO -->
          <tr>
            <td class="px-mobile" style="padding:36px 32px 12px 32px;">
              <span style="display:inline-block;background:${accentBg};color:${accentBar};font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">
                ${escapeHtml(BRAND.name)}
              </span>
              <h1 class="hero-title" style="margin:14px 0 0 0;font-family:${FONT};font-size:28px;line-height:34px;font-weight:700;color:${C.black};letter-spacing:-0.4px;">
                ${escapeHtml(title)}
              </h1>
              ${
                subtitle
                  ? `<p style="margin:10px 0 0 0;font-family:${FONT};font-size:15px;line-height:22px;color:${C.muted};">${escapeHtml(subtitle)}</p>`
                  : ""
              }
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td class="px-mobile" style="padding:20px 32px 36px 32px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};">
              ${body}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:${C.black};padding:28px 32px;color:#9CA3AF;font-family:${FONT};font-size:12px;line-height:18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-bottom:12px;">
                    <strong style="color:#FFFFFF;font-size:13px;letter-spacing:0.4px;">${escapeHtml(BRAND.name)}</strong>
                    <span style="display:block;color:#9CA3AF;margin-top:4px;">Cambridge · Pearson · Collins · Klett ve 15+ yayinevi</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 0;border-top:1px solid #1F2937;">
                    <a href="tel:${BRAND.phone.replace(/\s/g, "")}" style="color:${C.gold};text-decoration:none;font-weight:600;">${escapeHtml(BRAND.phone)}</a>
                    <span style="color:#374151;margin:0 8px;">·</span>
                    <a href="mailto:${BRAND.email}" style="color:${C.gold};text-decoration:none;font-weight:600;">${escapeHtml(BRAND.email)}</a>
                    <span style="color:#374151;margin:0 8px;">·</span>
                    <a href="${BRAND.whatsapp}" style="color:${C.gold};text-decoration:none;font-weight:600;">WhatsApp</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;border-top:1px solid #1F2937;color:#6B7280;">
                    <a href="${base}" style="color:#9CA3AF;text-decoration:none;">mastereducation.com.tr</a>
                    <span style="margin:0 8px;color:#374151;">·</span>
                    <a href="${base}/kvkk" style="color:#9CA3AF;text-decoration:none;">KVKK</a>
                    <span style="margin:0 8px;color:#374151;">·</span>
                    <a href="${base}/iletisim" style="color:#9CA3AF;text-decoration:none;">Iletisim</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:14px;color:#4B5563;font-size:11px;">
                    &copy; ${new Date().getFullYear()} ${escapeHtml(BRAND.name)}. Tum haklari saklidir. Bu mail otomatik olusturulmustur.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * CTA Button — inline-styled, mobile-friendly.
 * Variant'lar: primary (gold), dark (siyah), outline.
 */
function btn(href: string, label: string, variant: "primary" | "dark" | "outline" = "primary"): string {
  const styles = {
    primary: { bg: C.gold, color: C.black, border: C.gold },
    dark: { bg: C.black, color: "#FFFFFF", border: C.black },
    outline: { bg: "transparent", color: C.black, border: C.border },
  }[variant];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
      <td>
        <a href="${escapeHtml(href)}" class="cta-btn" style="display:inline-block;padding:13px 28px;background:${styles.bg};color:${styles.color};border:1px solid ${styles.border};border-radius:10px;font-family:${FONT};font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.2px;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/**
 * Info card — gri bg, içerik için subtle highlight.
 */
function infoCard(content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:18px 0;">
    <tr>
      <td style="padding:18px 20px;font-family:${FONT};font-size:14px;line-height:22px;color:${C.text};">
        ${content}
      </td>
    </tr>
  </table>`;
}

/**
 * Detail row — key/value formatted line (tutar, no, tarih).
 */
function detailRow(label: string, value: string, mono = false): string {
  return `<tr>
    <td style="padding:8px 0;color:${C.muted};font-size:13px;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;text-align:right;font-size:14px;color:${C.text};${mono ? `font-family:'SF Mono','Menlo',monospace;` : ""}font-weight:600;">${escapeHtml(value)}</td>
  </tr>`;
}

export function templateDealerApplicationReceived(name: string): EmailPayload {
  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  return {
    to: "",
    subject: "Bayilik basvurunuz alindi",
    html: wrap({
      title: "Basvurunuz alindi",
      preheader: `Bayi basvurunuz inceleme asamasinda — Master Education`,
      subtitle: `Merhaba ${name}, basvurunuz ekibimize ulasti.`,
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 14px 0;">
          Bayilik basvurunuz tarafimiza basariyla ulasti. Ekibimiz en kisa surede
          (genellikle 1-2 is gunu icinde) basvurunuzu inceleyecek ve sonucunu size
          email yoluyla iletecektir.
        </p>
        <p style="margin:0 0 14px 0;">
          Onay surecini hizlandirmak icin bayi panelinizden <strong>vergi levhasi</strong>,
          <strong>imza sirkuleri</strong> ve <strong>ticaret sicil gazetesi</strong>
          gibi belgelerinizi yukleyebilirsiniz.
        </p>
        ${btn(`${base}/bayi/belgeler`, "Belgelerimi Yukle", "dark")}
        ${infoCard(`<strong>Sorulariniz mi var?</strong><br>
          <a href="mailto:${BRAND.email}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.email}</a>
          uzerinden veya <a href="tel:${BRAND.phone.replace(/\s/g, "")}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.phone}</a> uzerinden bize ulasabilirsiniz.`)}`,
    }),
  };
}

export function templateDealerApproved(companyName: string): EmailPayload {
  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  return {
    to: "",
    subject: `${companyName} — bayiliginiz onaylandi`,
    html: wrap({
      title: "Bayiliginiz onaylandi",
      preheader: `Tebrikler! ${companyName} bayi olarak onaylandi.`,
      subtitle: `${companyName} icin bayi statunuz aktif. Hos geldiniz.`,
      heroAccent: "success",
      body: `
        <p style="margin:0 0 16px 0;">
          Bayilik basvurunuz <strong style="color:${C.success};">onaylandi</strong>!
          Artik <strong>${escapeHtml(companyName)}</strong> adina ozel iskontolu
          bayi fiyatlariyla siparis verebilir, cari hesap kullanabilirsiniz.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
          <tr>
            <td style="padding:14px 16px;background:${C.successBg};border-left:3px solid ${C.success};border-radius:8px;font-size:14px;color:${C.text};">
              <strong style="color:${C.success};">✓ Bayi paneline erisiminiz aktif</strong><br>
              <span style="color:${C.muted};">Bayi fiyatlariyla alisveris · Cari hesap · Toplu siparis · Ozel iskontolar</span>
            </td>
          </tr>
        </table>
        ${btn(`${base}/bayi`, "Bayi Paneline Git", "dark")}`,
    }),
  };
}

export function templateDealerRejected(
  companyName: string,
  reason: string | null
): EmailPayload {
  return {
    to: "",
    subject: "Bayilik basvurunuz hakkinda",
    html: wrap({
      title: "Basvurunuz hakkinda bilgilendirme",
      preheader: `${companyName} bayi basvurusu durumu hakkinda`,
      subtitle: `${companyName} basvurusunu su asamada onaylayamadik.`,
      heroAccent: "rose",
      body: `
        <p style="margin:0 0 14px 0;">
          <strong>${escapeHtml(companyName)}</strong> adina yapilan bayi basvurunuzu
          su an icin onaylayamadik.
        </p>
        ${
          reason
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
                <tr>
                  <td style="padding:16px 18px;background:${C.roseBg};border-left:3px solid ${C.rose};border-radius:8px;">
                    <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.rose};">Gerekce</p>
                    <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};line-height:21px;">${escapeHtml(reason)}</p>
                  </td>
                </tr>
              </table>`
            : ""
        }
        <p style="margin:0 0 14px 0;">
          Eksik belgelerinizi tamamlayip yeniden basvurabilir veya sorulariniz icin
          bize ulasabilirsiniz.
        </p>
        ${infoCard(`<a href="mailto:${BRAND.email}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.email}</a>
          &nbsp;·&nbsp;
          <a href="tel:${BRAND.phone.replace(/\s/g, "")}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.phone}</a>
          &nbsp;·&nbsp;
          <a href="${BRAND.whatsapp}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">WhatsApp</a>`)}`,
    }),
  };
}

/**
 * Fatura kesildi — bayiye e-fatura bilgilendirmesi.
 * sendPendingInvoice SENT olunca queue'ye atılır.
 */
export function templateInvoiceIssued(args: {
  companyName: string;
  orderNumber: string;
  documentId: string | number;
  total: number;
  panelUrl: string;
}): EmailPayload {
  const totalFmt = `${args.total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
  return {
    to: "",
    subject: `E-Faturaniz hazir — ${args.orderNumber}`,
    html: wrap({
      title: "E-Faturaniz hazir",
      preheader: `${args.orderNumber} icin e-fatura kesildi — ${totalFmt}`,
      subtitle: `${args.companyName} adina e-fatura sistemde.`,
      heroAccent: "success",
      body: `
        <p style="margin:0 0 16px 0;">
          Sayin <strong>${escapeHtml(args.companyName)}</strong>,<br>
          ${escapeHtml(args.orderNumber)} numarali siparisinize ait e-faturaniz
          <strong>KolayBi</strong> uzerinden basariyla kesilmistir.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Belge No", String(args.documentId), true)}
              ${detailRow("Siparis No", args.orderNumber, true)}
              <tr><td style="padding-top:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:13px;">Toplam Tutar</td><td style="padding-top:12px;border-top:1px solid ${C.border};text-align:right;font-size:18px;color:${C.black};font-weight:700;">${escapeHtml(totalFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${btn(args.panelUrl, "Bayi Paneline Git", "dark")}
        <p style="margin:18px 0 0 0;font-size:12px;color:${C.muted};">
          E-faturaniz Gelir Idaresi Baskanligi'na elektronik olarak iletilmistir.
          Faturalariniz <strong>Bayi Paneli &rsaquo; Faturalarim</strong> sayfasinda saklanir.
        </p>`,
    }),
  };
}

type OrderEmailItem = {
  name: string;
  quantity: number;
  lineTotal: number;
};

export function templateOrderCreated(
  customerName: string,
  orderNumber: string,
  items: OrderEmailItem[],
  total: number,
  contractsAcceptedAt?: Date | null
): EmailPayload {
  const base = process.env.NEXTAUTH_URL ?? "https://mastereducation.com.tr";
  const rows = items
    .map(
      (i, idx) => `<tr>
        <td style="padding:14px 0;${idx > 0 ? `border-top:1px solid ${C.borderSoft};` : ""}font-size:14px;color:${C.text};">
          <strong style="color:${C.black};">${escapeHtml(i.name)}</strong>
          <br><span style="font-size:12px;color:${C.muted};">${i.quantity} adet</span>
        </td>
        <td style="padding:14px 0;${idx > 0 ? `border-top:1px solid ${C.borderSoft};` : ""}text-align:right;font-size:14px;font-weight:600;color:${C.black};white-space:nowrap;">
          ${escapeHtml(formatPrice(i.lineTotal))}
        </td>
      </tr>`
    )
    .join("");
  return {
    to: "",
    subject: `Siparisiniz alindi — ${orderNumber}`,
    html: wrap({
      title: "Siparisiniz alindi",
      preheader: `${orderNumber} numarali siparisiniz onayda — toplam ${formatPrice(total)}`,
      subtitle: `Tesekkurler ${customerName}, siparisinizi hazirliyoruz.`,
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 6px 0;">
          Siparisiniz tarafimiza ulasti. En kisa surede hazirlanip kargoya verilecektir.
        </p>
        <p style="margin:0 0 18px 0;font-size:13px;color:${C.muted};">
          Siparis No: <strong style="color:${C.black};font-family:'SF Mono','Menlo',monospace;">${escapeHtml(orderNumber)}</strong>
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:8px 20px 4px 20px;">
            <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${C.muted};">Siparis Detayi</p>
          </td></tr>
          <tr><td style="padding:0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          </td></tr>
          <tr><td style="padding:14px 20px 18px 20px;border-top:2px solid ${C.border};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:13px;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">Toplam</td>
                <td style="text-align:right;font-size:20px;color:${C.black};font-weight:700;">${escapeHtml(formatPrice(total))}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${btn(`${base}/hesabim/siparislerim`, "Siparisi Goruntule", "dark")}

        ${
          contractsAcceptedAt
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 8px 0;background:${C.skyBg};border:1px solid ${C.sky};border-radius:12px;">
              <tr><td style="padding:14px 18px;font-size:13px;color:${C.text};">
                <strong style="color:${C.sky};font-size:11px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">Yasal Sozlesmeler</strong>
                Siparis sirasinda <a href="${base}/mesafeli-satis-sozlesmesi" style="color:${C.sky};font-weight:600;">Mesafeli Satis Sozlesmesi</a> ve
                <a href="${base}/on-bilgilendirme-formu" style="color:${C.sky};font-weight:600;">On Bilgilendirme Formu</a>'nu onayladiniz.
                Onay tarihi: <strong>${escapeHtml(contractsAcceptedAt.toLocaleString("tr-TR"))}</strong>.
                <br><span style="color:${C.muted};">Cayma hakkiniz teslim tarihinden itibaren 14 gun gecerlidir.</span>
              </td></tr>
            </table>`
            : ""
        }`,
    }),
  };
}

export function templateOrderStatusChanged(input: {
  customerName: string;
  orderNumber: string;
  status: string;
  trackingNumber: string | null;
  carrier: CargoCarrier | null;
  carrierName: string | null;
  estimatedDeliveryAt: Date | null;
}): EmailPayload {
  const {
    customerName,
    orderNumber,
    status,
    trackingNumber,
    carrier,
    carrierName,
    estimatedDeliveryAt,
  } = input;

  const carrierText = carrier ? carrierLabel(carrier, carrierName) : null;
  const trackUrl = carrierTrackingUrl(carrier, trackingNumber);
  const internalTrackUrl = trackingNumber
    ? `${process.env.NEXTAUTH_URL ?? ""}/kargo-takip/${encodeURIComponent(trackingNumber)}`
    : null;

  const etaLine = estimatedDeliveryAt
    ? `<p>Tahmini teslim: <strong>${new Date(estimatedDeliveryAt).toLocaleDateString("tr-TR")}</strong></p>`
    : "";

  const statusLabel = ORDER_STATUS_LABELS[status] ?? status;
  const accent: "gold" | "success" | "rose" | "sky" =
    status === "DELIVERED"
      ? "success"
      : status === "CANCELLED"
        ? "rose"
        : status === "SHIPPED"
          ? "sky"
          : "gold";

  const trackingBlock = trackingNumber
    ? `
      <p style="margin:6px 0 8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:${C.muted};">Kargo Bilgileri</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:0 0 16px 0;">
        <tr><td style="padding:14px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${carrierText ? detailRow("Kargo Firmasi", carrierText) : ""}
            ${detailRow("Takip No", trackingNumber, true)}
            ${
              estimatedDeliveryAt
                ? detailRow("Tahmini Teslim", new Date(estimatedDeliveryAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }))
                : ""
            }
          </table>
        </td></tr>
      </table>
      ${trackUrl ? btn(trackUrl, "Kargo Sitesinde Takip Et", "primary") : ""}
      ${internalTrackUrl ? btn(internalTrackUrl, "Siteden Gor", "outline") : ""}`
    : "";

  return {
    to: "",
    subject: `Siparisiniz ${statusLabel} — ${orderNumber}`,
    html: wrap({
      title: `Siparisiniz ${statusLabel.toLowerCase()}`,
      preheader: `${orderNumber} durumu: ${statusLabel}`,
      subtitle: `Merhaba ${customerName}, ${orderNumber} icin durum guncellemesi.`,
      heroAccent: accent,
      body: `
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};font-family:'SF Mono','Menlo',monospace;">${escapeHtml(orderNumber)}</strong>
          numarali siparisinizin durumu artik
          <strong style="color:${C.black};">${escapeHtml(statusLabel)}</strong>.
        </p>
        ${etaLine ? `<p style="margin:0 0 16px 0;color:${C.muted};font-size:14px;">${etaLine.replace(/<\/?p>/g, "")}</p>` : ""}
        ${trackingBlock}`,
    }),
  };
}

export function templatePasswordReset(resetUrl: string): EmailPayload {
  return {
    to: "",
    subject: "Sifre sifirlama talebi",
    html: wrap({
      title: "Sifre sifirlama talebi",
      preheader: "Hesabiniz icin yeni sifre belirlemek 1 saatlik bir baglanti.",
      subtitle: "Hesabiniza yeni sifre belirlemek icin asagidaki butonu kullanin.",
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 14px 0;">
          Hesabiniz icin sifre sifirlama talebi aldik. Asagidaki butona tiklayarak
          1 saat icinde yeni sifre belirleyebilirsiniz.
        </p>
        ${btn(resetUrl, "Sifreyi Sifirla", "dark")}
        <p style="margin:18px 0 6px 0;font-size:12px;color:${C.muted};">
          Buton calismazsa bu baglantiyi tarayicinizin adres cubuguna yapistirin:
        </p>
        <p style="margin:0;font-size:12px;color:${C.muted};word-break:break-all;font-family:'SF Mono','Menlo',monospace;">
          <a href="${escapeHtml(resetUrl)}" style="color:${C.goldDark};">${escapeHtml(resetUrl)}</a>
        </p>
        ${infoCard(`<strong style="color:${C.black};">Bu talebi siz yapmadiysaniz</strong>
          bu maili guvenle goz ardi edebilirsiniz. Sifreniz degismez.`)}`,
    }),
  };
}

export function templateEmailVerification(
  name: string,
  verifyUrl: string
): EmailPayload {
  return {
    to: "",
    subject: "Hos geldiniz — email adresinizi dogrulayin",
    html: wrap({
      title: `Hos geldiniz, ${name.split(" ")[0]}!`,
      preheader: `Master Education'a hos geldiniz — email adresinizi dogrulayin`,
      subtitle: "Hesabinizi aktiflestirmek icin email adresinizi dogrulayin.",
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 14px 0;">
          Master Education ailesine hos geldiniz! Cambridge, Pearson, Collins, Klett
          ve 15+ yayinevinden 4.800+ kitap sizi bekliyor.
        </p>
        <p style="margin:0 0 14px 0;">
          Hesabinizi aktiflestirmek ve siparis verebilmek icin email adresinizi
          dogrulamaniz gerekiyor:
        </p>
        ${btn(verifyUrl, "Email Adresimi Dogrula", "dark")}
        <p style="margin:18px 0 6px 0;font-size:12px;color:${C.muted};">
          Buton calismazsa bu baglantiyi tarayicinizin adres cubuguna yapistirin:
        </p>
        <p style="margin:0;font-size:12px;color:${C.muted};word-break:break-all;font-family:'SF Mono','Menlo',monospace;">
          <a href="${escapeHtml(verifyUrl)}" style="color:${C.goldDark};">${escapeHtml(verifyUrl)}</a>
        </p>
        ${infoCard(`<strong style="color:${C.black};">Siz kayit olmadiysaniz</strong>
          bu maili goz ardi edebilirsiniz. Hesap olusturulmaz.<br>
          <span style="color:${C.muted};">Baglanti 1 saat icinde gecerliligini yitirir.</span>`)}`,
    }),
  };
}
