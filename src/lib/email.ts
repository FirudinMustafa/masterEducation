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
let prodMisconfigWarned = false;

function getTransporter(): Transporter | null {
  if (transporterCache) return transporterCache;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !port || !user || !pass) {
    // Production'da SMTP/Resend env eksik = sessiz veri kaybi.
    // En azindan bir kez stderr'a sicak uyari yazsin (Sentry/Logtail bunu
    // olarak yakalar; admin "kayit emaili gelmiyor" sikayetinde root cause hizli bulunur).
    if (process.env.NODE_ENV === "production" && !prodMisconfigWarned) {
      console.error(
        "[email:misconfig] SMTP env eksik (SMTP_HOST/PORT/USER/PASS). " +
        "Tum email gonderimleri DRYRUN moduna dustu — kullanici dogrulama/sifre reset/siparis emailleri ULASMIYOR."
      );
      prodMisconfigWarned = true;
    }
    return null;
  }

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
    // Bu durumda **dev/staging'de** silently DRYRUN'a düş — kullanıcı akışı
    // bozulmasın. **Production'da** sandbox fallback yok: domain dogrulanmamis
    // bir Resend account ile prod'a cikilmamali; gercek failure olarak isle.
    const isResendSandbox =
      msg.includes("You can only send testing emails") ||
      (msg.includes("550") && msg.includes("verify a domain"));
    if (isResendSandbox && process.env.NODE_ENV !== "production") {
      console.warn(
        `[email:resend-sandbox] ${payload.to} — "${payload.subject}" engellendi (domain dogrulanmasi gerek)`
      );
      await logEmail(
        payload,
        "DRYRUN_SANDBOX",
        "Resend sandbox kisitlamasi — domain dogrulayin"
      );
      return true;
    }
    if (isResendSandbox) {
      console.error(
        `[email:resend-sandbox-PROD] ${payload.to} — "${payload.subject}" — domain DOGRULANMAMIS, prod'da sandbox fallback yok!`
      );
      // Devam et — asagida FAILED olarak loglanir
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
  // Mail templatelerinde logo HARICI bir URL'den fetch edilir. Domain canliya
  // cikana kadar (mastereducation.com.tr suan WordPress'te) `${NEXTAUTH_URL}/me-logo-v2.png`
  // 404 doner ve mail clientlar broken-image gosterir.
  // EMAIL_LOGO_URL env tanimliysa onu kullan (Vercel Blob'da kalici asset).
  // Fallback: NEXTAUTH_URL/me-logo-v2.png (domain Next.js'e gectiginde otomatik calisir).
  const explicit = process.env.EMAIL_LOGO_URL;
  if (explicit) return explicit;
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
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

  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";

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
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
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
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
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
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
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
    ? `${process.env.NEXTAUTH_URL || "https://mastereducation.com.tr"}/kargo-takip/${encodeURIComponent(trackingNumber)}`
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

// ─── P0: Operasyonel admin bildirimleri ─────────────────────────
// Müsteri ve bayi mailleri zaten vardı; bu blokta admin'in operasyonel
// kor noktasını kapatan templateler bulunuyor (yeni sipariş, başvuru,
// belge yüklendi). PII (kart no/CVV) kesinlikle yok — escapeHtml zorunlu.

const PAYMENT_METHOD_LABELS_TR: Record<string, string> = {
  CREDIT_CARD: "Kredi Karti (3DS)",
  OPEN_ACCOUNT: "Cari Hesap",
};

/**
 * Yeni siparis bildirimi → ADMIN'E.
 * isB2B → bayi siparisi (heroAccent sky, ozel rozet).
 * isHighValue → yuksek tutar uyarisi (banner). E21 bunun bayrak haliyle
 * ayri mail yerine bu sablonun icinde kalir; gurultuyu azaltir.
 */
export function templateOrderCreatedAdminNotice(args: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  isB2B: boolean;
  isHighValue: boolean;
  total: number;
  itemCount: number;
  paymentMethod: string;
  panelUrl: string;
  dealerCompany?: string | null;
}): EmailPayload {
  const totalFmt = formatPrice(args.total);
  const pmLabel = PAYMENT_METHOD_LABELS_TR[args.paymentMethod] ?? args.paymentMethod;
  const tag = args.isB2B ? "B2B Siparis" : "B2C Siparis";
  const accent = args.isB2B ? "sky" : "gold";
  const subjectPrefix = args.isHighValue ? "[YUKSEK TUTAR] " : "";
  const highValueBanner = args.isHighValue
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.roseBg};border:1px solid ${C.rose};border-radius:10px;margin:0 0 18px 0;">
        <tr><td style="padding:14px 18px;font-size:13px;color:${C.text};">
          <strong style="color:${C.rose};font-size:11px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px;">Yuksek Tutar Uyarisi</strong>
          Bu siparis HIGH_VALUE_ORDER_THRESHOLD esigini asti. Fraud kontrolu yapmaniz onerilir.
        </td></tr>
      </table>`
    : "";
  return {
    to: "",
    subject: `${subjectPrefix}Yeni siparis — ${args.orderNumber}`,
    html: wrap({
      title: "Yeni siparis alindi",
      preheader: `${args.orderNumber} — ${args.customerName} — ${totalFmt}`,
      subtitle: `${tag} · Panelde inceleyin`,
      heroAccent: accent,
      body: `
        ${highValueBanner}
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.customerName)}</strong>
          tarafindan yeni siparis olusturuldu.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Siparis No", args.orderNumber, true)}
              ${detailRow("Musteri", args.customerName)}
              ${detailRow("Email", args.customerEmail)}
              ${args.dealerCompany ? detailRow("Bayi", args.dealerCompany) : ""}
              ${detailRow("Odeme", pmLabel)}
              ${detailRow("Urun Sayisi", String(args.itemCount))}
              <tr><td style="padding-top:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:13px;">Toplam</td><td style="padding-top:12px;border-top:1px solid ${C.border};text-align:right;font-size:18px;color:${C.black};font-weight:700;">${escapeHtml(totalFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${btn(args.panelUrl, "Panelde Goruntule", "dark")}`,
    }),
  };
}

/**
 * Yeni bayi basvurusu bildirimi → ADMIN'E.
 */
export function templateDealerApplicationAdminNotice(args: {
  companyName: string;
  contactPerson: string | null;
  email: string;
  phone: string;
  taxOffice: string;
  taxNumber: string;
  panelUrl: string;
}): EmailPayload {
  return {
    to: "",
    subject: `Yeni bayi basvurusu — ${args.companyName}`,
    html: wrap({
      title: "Yeni bayi basvurusu",
      preheader: `${args.companyName} basvurdu — incelemeniz icin bekliyor`,
      subtitle: "Panelde belge ve bilgileri inceleyin.",
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.companyName)}</strong>
          tarafindan yeni bayi basvurusu olusturuldu.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Sirket", args.companyName)}
              ${args.contactPerson ? detailRow("Yetkili", args.contactPerson) : ""}
              ${detailRow("Email", args.email)}
              ${detailRow("Telefon", args.phone)}
              ${detailRow("Vergi Dairesi", args.taxOffice)}
              ${detailRow("Vergi No", args.taxNumber, true)}
            </table>
          </td></tr>
        </table>
        ${btn(args.panelUrl, "Basvuruyu Incele", "dark")}`,
    }),
  };
}

/**
 * 3DS odeme basarili — musteri ve admin icin tek sablon.
 * Admin maline `forAdmin: true` veriyoruz; ufak fark: panel CTA + farkli baslik.
 */
export function templatePaymentSucceeded(args: {
  orderNumber: string;
  customerName: string;
  total: number;
  cardLast4: string | null;
  cardBrand: string | null;
  forAdmin?: boolean;
  panelUrl?: string;
}): EmailPayload {
  const totalFmt = formatPrice(args.total);
  const cardLine =
    args.cardLast4 && args.cardBrand
      ? `${escapeHtml(args.cardBrand)} •••• ${escapeHtml(args.cardLast4)}`
      : args.cardLast4
        ? `•••• ${escapeHtml(args.cardLast4)}`
        : null;
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  const target = args.forAdmin
    ? args.panelUrl ?? `${base}/admin/siparisler`
    : `${base}/hesabim/siparislerim`;
  const targetLabel = args.forAdmin ? "Panelde Goruntule" : "Siparisi Goruntule";
  const title = args.forAdmin ? "Odeme alindi" : "Odemeniz alindi";
  return {
    to: "",
    subject: args.forAdmin
      ? `Odeme tamamlandi — ${args.orderNumber}`
      : `Odemeniz alindi — ${args.orderNumber}`,
    html: wrap({
      title,
      preheader: `${args.orderNumber} icin odeme basariyla alindi — ${totalFmt}`,
      subtitle: args.forAdmin
        ? `${args.customerName} odemeyi tamamladi.`
        : `Tesekkurler ${args.customerName}, siparisinizi hazirliyoruz.`,
      heroAccent: "success",
      body: `
        <p style="margin:0 0 16px 0;">
          ${args.forAdmin ? `<strong>${escapeHtml(args.customerName)}</strong> tarafindan` : "Sizin tarafinizdan"}
          olusturulan
          <strong style="color:${C.black};font-family:'SF Mono','Menlo',monospace;">${escapeHtml(args.orderNumber)}</strong>
          numarali siparis icin odeme
          <strong style="color:${C.success};">basariyla</strong> tamamlandi.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Siparis No", args.orderNumber, true)}
              ${cardLine ? detailRow("Kart", cardLine) : ""}
              <tr><td style="padding-top:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:13px;">Tutar</td><td style="padding-top:12px;border-top:1px solid ${C.border};text-align:right;font-size:18px;color:${C.black};font-weight:700;">${escapeHtml(totalFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${btn(target, targetLabel, "dark")}`,
    }),
  };
}

/**
 * 3DS odeme basarisiz — musteriye bilgi + tekrar deneme CTA.
 */
export function templatePaymentFailed(args: {
  orderNumber: string;
  customerName: string;
  reason: string | null;
  retryUrl: string;
}): EmailPayload {
  return {
    to: "",
    subject: `Odeme tamamlanamadi — ${args.orderNumber}`,
    html: wrap({
      title: "Odemeniz tamamlanamadi",
      preheader: `${args.orderNumber} icin odeme basarisiz — yeniden denemek icin tiklayin`,
      subtitle: `Merhaba ${args.customerName}, odemeniz tamamlanamadi.`,
      heroAccent: "rose",
      body: `
        <p style="margin:0 0 14px 0;">
          <strong style="color:${C.black};font-family:'SF Mono','Menlo',monospace;">${escapeHtml(args.orderNumber)}</strong>
          numarali siparisiniz icin
          <strong style="color:${C.rose};">odeme alinamadi</strong>.
          Endiselenmeyin — tekrar deneyebilir veya farkli bir kart kullanabilirsiniz.
        </p>
        ${
          args.reason
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
                <tr><td style="padding:14px 18px;background:${C.roseBg};border-left:3px solid ${C.rose};border-radius:8px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.rose};">Sebep</p>
                  <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};">${escapeHtml(args.reason)}</p>
                </td></tr>
              </table>`
            : ""
        }
        ${btn(args.retryUrl, "Yeniden Deneyin", "dark")}
        ${infoCard(`Sorulariniz icin
          <a href="mailto:${BRAND.email}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.email}</a>
          veya
          <a href="${BRAND.whatsapp}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">WhatsApp</a>
          uzerinden bize ulasabilirsiniz.`)}`,
    }),
  };
}

const DEALER_DOC_KIND_LABELS_TR: Record<string, string> = {
  TAX_CERTIFICATE: "Vergi Levhasi",
  TRADE_REG_GAZETTE: "Ticaret Sicil Gazetesi",
  SIGNATURE_CIRCULAR: "Imza Sirkuleri",
  OTHER: "Diger Belge",
};

/**
 * Bayi belgesi incelendi → BAYIYE.
 * REJECTED'da `note` zorunlu (admin/dealers/[id]/documents/[docId] route'u zorluyor).
 */
export function templateDealerDocumentReviewed(args: {
  companyName: string;
  documentKind: string;
  status: "APPROVED" | "REJECTED";
  note: string | null;
  panelUrl: string;
}): EmailPayload {
  const kindLabel = DEALER_DOC_KIND_LABELS_TR[args.documentKind] ?? args.documentKind;
  const isApproved = args.status === "APPROVED";
  return {
    to: "",
    subject: isApproved
      ? `Belgeniz onaylandi — ${kindLabel}`
      : `Belgeniz reddedildi — ${kindLabel}`,
    html: wrap({
      title: isApproved ? "Belgeniz onaylandi" : "Belgeniz reddedildi",
      preheader: `${kindLabel} — ${isApproved ? "onaylandi" : "reddedildi"}`,
      subtitle: `${args.companyName} icin belge incelemesi tamamlandi.`,
      heroAccent: isApproved ? "success" : "rose",
      body: `
        <p style="margin:0 0 14px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.companyName)}</strong>
          adina yukledigininiz
          <strong>${escapeHtml(kindLabel)}</strong>
          belgesi
          <strong style="color:${isApproved ? C.success : C.rose};">${isApproved ? "onaylandi" : "reddedildi"}</strong>.
        </p>
        ${
          args.note
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
                <tr><td style="padding:14px 18px;background:${isApproved ? C.successBg : C.roseBg};border-left:3px solid ${isApproved ? C.success : C.rose};border-radius:8px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${isApproved ? C.success : C.rose};">${isApproved ? "Admin Notu" : "Red Gerekcesi"}</p>
                  <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};line-height:21px;">${escapeHtml(args.note)}</p>
                </td></tr>
              </table>`
            : ""
        }
        ${
          isApproved
            ? `<p style="margin:0 0 6px 0;color:${C.muted};font-size:13px;">Tum belgeleriniz onaylanirsa bayilik basvurunuz onaya alinabilir.</p>`
            : `<p style="margin:0 0 6px 0;color:${C.muted};font-size:13px;">Eksikleri tamamlayarak yeni bir belge yukleyebilirsiniz.</p>`
        }
        ${btn(args.panelUrl, "Bayi Paneline Git", "dark")}`,
    }),
  };
}

/**
 * Bayi yeni belge yukledi → ADMIN'E.
 */
export function templateDealerDocumentUploadedAdminNotice(args: {
  companyName: string;
  documentKind: string;
  panelUrl: string;
}): EmailPayload {
  const kindLabel = DEALER_DOC_KIND_LABELS_TR[args.documentKind] ?? args.documentKind;
  return {
    to: "",
    subject: `Yeni belge — ${args.companyName}`,
    html: wrap({
      title: "Yeni belge yuklendi",
      preheader: `${args.companyName} ${kindLabel} yukledi — inceleme bekleniyor`,
      subtitle: `${args.companyName} bayi paneline yeni belge yukledi.`,
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.companyName)}</strong>
          tarafindan
          <strong>${escapeHtml(kindLabel)}</strong>
          tipinde yeni bir belge yuklendi.
        </p>
        <p style="margin:0 0 16px 0;color:${C.muted};font-size:13px;">
          Belgenin durumu PENDING — admin panelinden inceleyip
          onay/red islemini gerceklestirebilirsiniz.
        </p>
        ${btn(args.panelUrl, "Belgeleri Incele", "dark")}`,
    }),
  };
}

// ─── P1: Guvenlik & UX kritik bildirimler ────────────────────────

function formatWhen(d: Date): string {
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * E8 — Sifre degisti → kullaniciya guvenlik bildirimi.
 * "Bu siz degildiyseniz" CTA + IP/UA ile ATO algilamasi.
 */
export function templatePasswordChanged(args: {
  name: string;
  when: Date;
  ip: string | null;
  userAgent: string | null;
}): EmailPayload {
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  const whenFmt = formatWhen(args.when);
  return {
    to: "",
    subject: "Sifreniz degistirildi",
    html: wrap({
      title: "Sifreniz degistirildi",
      preheader: `Hesabinizin sifresi ${whenFmt} tarihinde degistirildi.`,
      subtitle: `Merhaba ${args.name}, hesabinizla ilgili guvenlik bildirimi.`,
      heroAccent: "sky",
      body: `
        <p style="margin:0 0 16px 0;">
          Hesabinizin sifresi
          <strong style="color:${C.black};">${escapeHtml(whenFmt)}</strong>
          tarihinde basariyla degistirildi.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Tarih", whenFmt)}
              ${args.ip ? detailRow("IP", args.ip, true) : ""}
              ${args.userAgent ? detailRow("Cihaz", args.userAgent.slice(0, 120)) : ""}
            </table>
          </td></tr>
        </table>
        ${infoCard(`<strong style="color:${C.rose};">Bu siz degildiyseniz</strong>
          hemen sifrenizi sifirlayin ve oturumlarinizi kapatin.`)}
        ${btn(`${base}/sifremi-unuttum`, "Sifremi Sifirla", "dark")}`,
    }),
  };
}

/**
 * E9 — Email degisti.
 * `forOldEmail: true` → eski adrese guvenlik uyarisi (revoke CTA — destek).
 * `forOldEmail: false` → yeni adrese hosgeldin (verification ayrica gelir).
 */
export function templateEmailChanged(args: {
  name: string;
  oldEmail: string;
  newEmail: string;
  when: Date;
  ip: string | null;
  forOldEmail: boolean;
}): EmailPayload {
  const whenFmt = formatWhen(args.when);
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  if (args.forOldEmail) {
    return {
      to: "",
      subject: "Email adresiniz degistirildi",
      html: wrap({
        title: "Email adresiniz degistirildi",
        preheader: `Hesabiniza bagli email adresi ${args.newEmail} olarak degistirildi.`,
        subtitle: `Merhaba ${args.name}, hesabinizla ilgili guvenlik bildirimi.`,
        heroAccent: "sky",
        body: `
          <p style="margin:0 0 14px 0;">
            Hesabinizin email adresi
            <strong style="color:${C.black};">${escapeHtml(whenFmt)}</strong>
            tarihinde degistirildi.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
            <tr><td style="padding:18px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${detailRow("Eski Email", args.oldEmail)}
                ${detailRow("Yeni Email", args.newEmail)}
                ${detailRow("Tarih", whenFmt)}
                ${args.ip ? detailRow("IP", args.ip, true) : ""}
              </table>
            </td></tr>
          </table>
          ${infoCard(`<strong style="color:${C.rose};">Bu degisikligi siz yapmadiysaniz</strong>
            hemen
            <a href="mailto:${BRAND.email}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.email}</a>
            uzerinden bize ulasarak hesabinizi geri alabilirsiniz.`)}`,
      }),
    };
  }
  return {
    to: "",
    subject: "Yeni email adresiniz onayda",
    html: wrap({
      title: "Yeni email adresiniz",
      preheader: `Master Education hesabinizda email adresinizi guncellediniz.`,
      subtitle: `Merhaba ${args.name}, yeni adresinize hos geldiniz.`,
      heroAccent: "gold",
      body: `
        <p style="margin:0 0 14px 0;">
          Master Education hesabinizda email adresinizi
          <strong style="color:${C.black};">${escapeHtml(args.newEmail)}</strong>
          olarak guncellediniz. Hesabin guvenligi icin yeni adresinizi
          onaylamanizi istiyoruz — onay maili kisa surede gelecek.
        </p>
        ${btn(`${base}/hesabim`, "Hesabima Git", "dark")}`,
    }),
  };
}

/**
 * E10 — Hesap silindi/anonimlestirildi.
 * KVKK acisindan kullaniciya yasal kanit; silinmeden ONCE gonder
 * (silindikten sonra adres yok).
 */
export function templateAccountDeleted(args: {
  name: string;
  mode: "hard" | "anonymize";
  when: Date;
}): EmailPayload {
  const whenFmt = formatWhen(args.when);
  const isHard = args.mode === "hard";
  return {
    to: "",
    subject: isHard ? "Hesabiniz silindi" : "Hesabiniz anonimlestirildi",
    html: wrap({
      title: isHard ? "Hesabiniz silindi" : "Hesabiniz anonimlestirildi",
      preheader: `Master Education hesabiniz ${whenFmt} tarihinde ${isHard ? "silindi" : "anonimlestirildi"}.`,
      subtitle: `Merhaba ${args.name}, talebiniz uygulandi.`,
      heroAccent: isHard ? "rose" : "sky",
      body: `
        <p style="margin:0 0 14px 0;">
          Master Education hesabiniz
          <strong style="color:${C.black};">${escapeHtml(whenFmt)}</strong>
          tarihinde
          <strong style="color:${isHard ? C.rose : C.sky};">${isHard ? "tamamen silindi" : "anonimlestirildi"}</strong>.
        </p>
        ${
          isHard
            ? `<p style="margin:0 0 14px 0;color:${C.muted};font-size:14px;">
                Tum kisisel verileriniz (ad, adres, telefon, parola) sistemden
                kalici olarak silindi. Bu islem geri alinamaz.
              </p>`
            : `<p style="margin:0 0 14px 0;color:${C.muted};font-size:14px;">
                KVKK kapsaminda kisisel verileriniz (ad, email, adres, telefon)
                sistemden anonimlestirildi. Muhasebe ve yasal kayitlar gerekce
                ile siparis kayitlariniz tutulmaya devam edecek; ancak hicbiri
                size geri baglanamaz.
              </p>`
        }
        ${infoCard(`Sorulariniz icin
          <a href="mailto:${BRAND.email}" style="color:${C.goldDark};text-decoration:none;font-weight:600;">${BRAND.email}</a>
          uzerinden bize ulasabilirsiniz.<br>
          Master Education ailesindeki zamaniniz icin tesekkur ederiz.`)}`,
    }),
  };
}

/**
 * E11 — Siparis iptal edildi.
 * templateOrderStatusChanged jenerik kullanmak yerine ozel mesaj +
 * iade bilgisi (kart icin 3-7 is gunu, cari icin ledger kredi).
 */
export function templateOrderCancelled(args: {
  customerName: string;
  orderNumber: string;
  total: number;
  paymentMethod: string;
  reason: string | null;
}): EmailPayload {
  const totalFmt = formatPrice(args.total);
  const refundInfo =
    args.paymentMethod === "OPEN_ACCOUNT"
      ? "Acik hesap bakiyenize iade kredisi otomatik islendi. Bayi panelinden ekstreyi gorebilirsiniz."
      : args.paymentMethod === "CREDIT_CARD"
        ? "Kredi karti odemenizin iadesi 3-7 is gunu icinde kart hesabinizda gorunecektir."
        : "Iade islemi icin destek ekibi sizinle iletisime gececektir.";
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  return {
    to: "",
    subject: `Siparisiniz iptal edildi — ${args.orderNumber}`,
    html: wrap({
      title: "Siparisiniz iptal edildi",
      preheader: `${args.orderNumber} numarali siparisiniz iptal edildi.`,
      subtitle: `Merhaba ${args.customerName}, siparis durumu degisti.`,
      heroAccent: "rose",
      body: `
        <p style="margin:0 0 14px 0;">
          <strong style="color:${C.black};font-family:'SF Mono','Menlo',monospace;">${escapeHtml(args.orderNumber)}</strong>
          numarali siparisiniz
          <strong style="color:${C.rose};">iptal edildi</strong>.
        </p>
        ${
          args.reason
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
                <tr><td style="padding:14px 18px;background:${C.roseBg};border-left:3px solid ${C.rose};border-radius:8px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.rose};">Iptal Gerekcesi</p>
                  <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};line-height:21px;">${escapeHtml(args.reason)}</p>
                </td></tr>
              </table>`
            : ""
        }
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Siparis No", args.orderNumber, true)}
              <tr><td style="padding-top:8px;color:${C.muted};font-size:13px;">Tutar</td><td style="padding-top:8px;text-align:right;font-size:16px;color:${C.black};font-weight:700;">${escapeHtml(totalFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${infoCard(`<strong style="color:${C.black};">Iade bilgisi</strong><br>
          <span style="color:${C.muted};">${escapeHtml(refundInfo)}</span>`)}
        ${btn(`${base}/hesabim/siparislerim`, "Siparislerimi Goruntule", "dark")}`,
    }),
  };
}

/**
 * E12 — Bayi kredi limiti degisti.
 * Artis: success accent, azalma: gold accent.
 */
export function templateDealerCreditLimitChanged(args: {
  companyName: string;
  oldLimit: number;
  newLimit: number;
  reason: string | null;
}): EmailPayload {
  const oldFmt = formatPrice(args.oldLimit);
  const newFmt = formatPrice(args.newLimit);
  const increased = args.newLimit > args.oldLimit;
  const diff = Math.abs(args.newLimit - args.oldLimit);
  const diffFmt = formatPrice(diff);
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  return {
    to: "",
    subject: increased
      ? "Kredi limitiniz artirildi"
      : "Kredi limitiniz guncellendi",
    html: wrap({
      title: increased ? "Kredi limitiniz artirildi" : "Kredi limitiniz guncellendi",
      preheader: `${args.companyName} icin yeni limit: ${newFmt}`,
      subtitle: `${args.companyName} icin cari limit ayarlandi.`,
      heroAccent: increased ? "success" : "gold",
      body: `
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.companyName)}</strong>
          icin acik hesap kredi limitiniz
          <strong style="color:${increased ? C.success : C.goldDark};">${increased ? "artirildi" : "guncellendi"}</strong>.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Eski Limit", oldFmt)}
              ${detailRow("Yeni Limit", newFmt)}
              <tr><td style="padding-top:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:13px;">${increased ? "Artis" : "Azalma"}</td><td style="padding-top:12px;border-top:1px solid ${C.border};text-align:right;font-size:16px;color:${increased ? C.success : C.goldDark};font-weight:700;">${escapeHtml(diffFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${
          args.reason
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
                <tr><td style="padding:14px 18px;background:${C.bg};border-left:3px solid ${increased ? C.success : C.gold};border-radius:8px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.muted};">Aciklama</p>
                  <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};line-height:21px;">${escapeHtml(args.reason)}</p>
                </td></tr>
              </table>`
            : ""
        }
        ${btn(`${base}/bayi/ekstre`, "Ekstreyi Goruntule", "dark")}`,
    }),
  };
}

/**
 * E13 — Cari hesap hareketi.
 * kind: PAYMENT (tahsilat), ADJUSTMENT (manuel duzeltme).
 */
export function templateDealerLedgerEntry(args: {
  companyName: string;
  kind: "PAYMENT" | "ADJUSTMENT";
  amount: number;
  note: string | null;
  newBalance: number;
}): EmailPayload {
  const amountFmt = formatPrice(Math.abs(args.amount));
  const balanceFmt = formatPrice(args.newBalance);
  const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
  const isPayment = args.kind === "PAYMENT";
  // PAYMENT amount: negatif (kredi); ADJUSTMENT amount: + veya -
  const direction =
    args.amount < 0
      ? "Hesabinizdan dustu (alacak)"
      : "Hesabiniza eklendi (borc)";
  const subject = isPayment
    ? `Tahsilatiniz kaydedildi — ${amountFmt}`
    : `Cari hareket — ${amountFmt}`;
  return {
    to: "",
    subject,
    html: wrap({
      title: isPayment ? "Tahsilat kaydedildi" : "Cari hareket islendi",
      preheader: `${args.companyName} cari hesabinizda yeni hareket var — yeni bakiye ${balanceFmt}`,
      subtitle: `${args.companyName} icin manuel cari hareketi.`,
      heroAccent: isPayment ? "success" : "gold",
      body: `
        <p style="margin:0 0 16px 0;">
          <strong style="color:${C.black};">${escapeHtml(args.companyName)}</strong>
          cari hesabinizda yeni
          <strong>${isPayment ? "tahsilat" : "manuel duzeltme"}</strong>
          islendi.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};border:1px solid ${C.border};border-radius:12px;margin:8px 0 18px 0;">
          <tr><td style="padding:18px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${detailRow("Hareket", isPayment ? "Tahsilat" : "Manuel Duzeltme")}
              ${detailRow("Yon", direction)}
              ${detailRow("Tutar", amountFmt)}
              <tr><td style="padding-top:12px;border-top:1px solid ${C.border};color:${C.muted};font-size:13px;">Yeni Bakiye</td><td style="padding-top:12px;border-top:1px solid ${C.border};text-align:right;font-size:18px;color:${C.black};font-weight:700;">${escapeHtml(balanceFmt)}</td></tr>
            </table>
          </td></tr>
        </table>
        ${
          args.note
            ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 18px 0;">
                <tr><td style="padding:14px 18px;background:${C.bg};border-left:3px solid ${isPayment ? C.success : C.gold};border-radius:8px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${C.muted};">Aciklama</p>
                  <p style="margin:6px 0 0 0;font-size:14px;color:${C.text};line-height:21px;">${escapeHtml(args.note)}</p>
                </td></tr>
              </table>`
            : ""
        }
        ${btn(`${base}/bayi/ekstre`, "Ekstreyi Goruntule", "dark")}`,
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
