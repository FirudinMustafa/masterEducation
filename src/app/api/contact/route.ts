import { NextRequest, NextResponse, after } from "next/server";
import { contactFormSchema, flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { queueEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/get-client-ip";

export async function POST(req: NextRequest) {
  // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali, QA 2026-05-18)
  const ip = getClientIp(req.headers);
  const rl = rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Çok fazla mesaj. Bir sure sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = contactFormSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { name, email, phone, subject: rawSubject, message } = parsed.data;
  // SECURITY: nodemailer would happily forward CR/LF in the subject as raw
  // header bytes, enabling header injection (e.g. inserting a second BCC).
  // Strip control chars and cap length defensively even if the validator
  // already rejects them.
  const subject = rawSubject.replace(/[\r\n]+/g, " ").slice(0, 200);

  // Admin bildirimi — SMTP bagliyken gercek mesaj gider, yoksa DRYRUN log.
  const adminEmail = env.ADMIN_EMAIL ?? "info@mastereducation.com.tr";
  const body = `Yeni iletişim formu\n\nAd: ${name}\nEmail: ${email}\nTelefon: ${phone ?? "-"}\n\nKonu: ${subject}\n\nMesaj:\n${message}`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  after(() => {
    // 1) Admin bildirimi
    queueEmail({
      to: adminEmail,
      subject: `[İletişim] ${subject}`,
      text: body,
      html: `<pre style="font-family: system-ui; white-space: pre-wrap;">${esc(
        body
      )}</pre>`,
    });

    // 2) Gönderene otomatik onay/teşekkür maili (KVKK akışıyla tutarlı)
    queueEmail({
      to: email,
      subject: "Mesajınızı aldık — Master Education",
      text: `Sayın ${name},\n\nMesajınız bize ulaştı, en kısa sürede dönüş yapacağız.\n\nKonu: ${subject}\n\nMaster Education`,
      html: `<div style="font-family:system-ui;line-height:1.6;">
        <p>Sayın <strong>${esc(name)}</strong>,</p>
        <p>Mesajınız bize ulaştı. En kısa sürede dönüş yapacağız.</p>
        <p style="color:#666;font-size:13px;">Konu: ${esc(subject)}</p>
        <p style="margin-top:18px;">Master Education</p>
      </div>`,
    });
  });

  logAudit({
    actorId: null,
    action: "CONTACT_FORM_SUBMIT",
    entityType: "system",
    entityId: "contact-form",
    metadata: { email, subject, ip: ip.slice(0, 64) },
  });

  return NextResponse.json({ ok: true });
}
