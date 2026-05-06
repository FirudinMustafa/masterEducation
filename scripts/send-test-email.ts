/**
 * Standalone email test — env.ts validator'i bypass eder, dogrudan Resend SMTP'ye
 * baglanir. Master Education templatesinin minimum bir kopyasi ile logo + branding
 * gorunurlugunu test eder.
 *
 * Kullanim:
 *   RESEND_API_KEY=re_xxx TO=you@example.com npx tsx scripts/send-test-email.ts
 */
import "dotenv/config";
import nodemailer from "nodemailer";

const apiKey = process.env.RESEND_API_KEY;
const to = process.env.TO || "firudinmustafayev00@gmail.com";
// Resend sandbox: domain dogrulanmadan sadece "onboarding@resend.dev" + hesap sahibi mail.
const from = process.env.SMTP_FROM || "Master Education <onboarding@resend.dev>";
// NEXTAUTH_URL bos olursa logo URL absolute olmaz — public, HTTPS bir base ver.
const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
// Logo: Vercel Blob'daki sabit URL (domain henuz Next.js'e baglanmadi).
const logoSrcOverride = process.env.EMAIL_LOGO_URL;

if (!apiKey) {
  console.error("RESEND_API_KEY env'de yok. Komutu su sekilde calistir:");
  console.error("  RESEND_API_KEY=re_xxx npx tsx scripts/send-test-email.ts");
  process.exit(1);
}

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
};
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const logoSrc = logoSrcOverride || `${base}/me-logo-v2.png`;

const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Master Education — Mail Test</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${C.surface};border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,15,15,0.06);">
      <tr><td style="padding:24px 32px;border-bottom:1px solid ${C.borderSoft};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">
            <a href="${base}" style="text-decoration:none;display:inline-block;">
              <img src="${logoSrc}" alt="Master Education" width="160" style="display:block;max-width:160px;height:auto;border:0;outline:none;">
            </a>
          </td>
          <td valign="middle" align="right" style="font-size:11px;color:${C.muted};letter-spacing:0.6px;text-transform:uppercase;">Egitimin Tek Adresi</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;background:linear-gradient(90deg,${C.gold} 0%,#FFD566 50%,${C.goldDark} 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:36px 32px 12px;">
        <span style="display:inline-block;background:${C.goldLight};color:${C.goldDark};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;padding:6px 12px;border-radius:999px;">Master Education</span>
        <h1 style="margin:14px 0 0;font-size:28px;line-height:34px;font-weight:700;color:${C.black};letter-spacing:-0.4px;">Mail sistemi calisiyor ✓</h1>
        <p style="margin:10px 0 0;font-size:15px;line-height:22px;color:${C.muted};">Bu mail Resend SMTP uzerinden ${new Date().toLocaleString("tr-TR")} tarihinde gonderildi.</p>
      </td></tr>
      <tr><td style="padding:20px 32px 36px;font-size:15px;line-height:24px;color:${C.text};">
        <p style="margin:0 0 14px;">Eger bu maili goruyorsan:</p>
        <ul style="margin:0 0 14px;padding-left:20px;">
          <li>Resend SMTP entegrasyonu <strong>calisiyor</strong>.</li>
          <li>Yukarida Master Education logosu gorunuyor mu? <strong>Logo URL: <code>${logoSrc}</code></strong></li>
          <li>Marka rengi (altın strip + gold badge) ve tipografi dogru mu?</li>
        </ul>
        <p style="margin:0 0 8px;color:${C.muted};font-size:13px;">Logo gorunmuyor ise: NEXTAUTH_URL ya bos ya da public erisilemez. Su an: <code>${base}</code></p>
      </td></tr>
      <tr><td style="background:${C.black};padding:28px 32px;color:#9CA3AF;font-size:12px;line-height:18px;">
        <strong style="color:#FFFFFF;font-size:13px;">Master Education</strong>
        <span style="display:block;margin-top:4px;">Cambridge · Pearson · Collins · Klett ve 15+ yayinevi</span>
        <div style="padding:14px 0;border-top:1px solid #1F2937;margin-top:14px;">
          <a href="tel:05394116595" style="color:${C.gold};text-decoration:none;font-weight:600;">0 539 411 65 95</a>
          <span style="color:#374151;margin:0 8px;">·</span>
          <a href="mailto:info@mastereducation.com.tr" style="color:${C.gold};text-decoration:none;font-weight:600;">info@mastereducation.com.tr</a>
        </div>
        <div style="color:#4B5563;font-size:11px;border-top:1px solid #1F2937;padding-top:14px;">© ${new Date().getFullYear()} Master Education. Tum haklari saklidir.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const transporter = nodemailer.createTransport({
  host: "smtp.resend.com",
  port: 465,
  secure: true,
  auth: { user: "resend", pass: apiKey },
});

console.log(`Gonderiliyor: ${to}`);
console.log(`From:        ${from}`);
console.log(`Logo URL:    ${logoSrc}`);

async function main() {
  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "Master Education — Mail Sistemi Test",
      html,
      text: "Master Education mail sistemi calisiyor. (HTML versiyonu icin mail clientinizin HTML modunu acin.)",
    });
    console.log("\n✓ BASARILI");
    console.log("  messageId:", info.messageId);
    console.log("  response:", info.response);
    console.log("  accepted:", info.accepted);
    console.log("  rejected:", info.rejected);
  } catch (e) {
    console.error("\n✗ HATA");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
main();
