/**
 * Resend HTTP API uzerinden direkt test gonderim — SMTP kullanmaz.
 * Vercel serverless'ta SMTP outbound bloku oldugu icin email.ts artik bu yolu kullaniyor.
 */
import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY?.trim();
const to = process.env.TO || "firudinmustafayev00@gmail.com";
const from = process.env.SMTP_FROM || "Master Education <onboarding@resend.dev>";
const logo = process.env.EMAIL_LOGO_URL || "https://nlb89hr416wkovqu.public.blob.vercel-storage.com/email-assets/me-logo-v2.png";

if (!apiKey) {
  console.error("RESEND_API_KEY env yok.");
  process.exit(1);
}

async function main() {
  const resend = new Resend(apiKey!);
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#F4F5F7;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
      <div style="padding:20px 28px;border-bottom:1px solid #f3f4f6;">
        <img src="${logo}" alt="Master Education" width="160" style="display:block;border:0;">
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#F5B800,#FFD566,#B88600);"></div>
      <div style="padding:32px 28px;">
        <h1 style="margin:0 0 12px;color:#0F0F0F;font-size:24px;">Resend HTTP API Test ✓</h1>
        <p style="color:#374151;line-height:1.6;">${new Date().toLocaleString("tr-TR")} tarihinde <strong>Resend SDK fetch</strong> uzerinden gonderildi (SMTP degil).</p>
        <p style="color:#6b7280;font-size:13px;">Vercel serverless'ta SMTP outbound bloklu — bu yontem her ortamda calisiyor.</p>
      </div>
    </div>
  </body></html>`;

  console.log(`Gonderiliyor: ${to}\nFrom: ${from}\nLogo: ${logo}\n`);
  const { data, error } = await resend.emails.send({
    from, to, subject: "Master Education — Resend HTTP API Test", html,
  });
  if (error) {
    console.error("✗ HATA:", error);
    process.exit(1);
  }
  console.log("✓ BASARILI");
  console.log("  id:", data?.id);
}
main().catch((e) => { console.error(e); process.exit(1); });
