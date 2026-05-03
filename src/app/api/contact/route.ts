import { NextRequest, NextResponse, after } from "next/server";
import { contactFormSchema, flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { queueEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Cok fazla mesaj. Bir sure sonra tekrar deneyin." },
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

  const { name, email, phone, subject, message } = parsed.data;

  // Admin bildirimi — SMTP bagliyken gercek mesaj gider, yoksa DRYRUN log.
  const adminEmail = env.ADMIN_EMAIL ?? "info@mastereducation.com.tr";
  const body = `Yeni iletisim formu\n\nAd: ${name}\nEmail: ${email}\nTelefon: ${phone ?? "-"}\n\nKonu: ${subject}\n\nMesaj:\n${message}`;

  after(() => {
    queueEmail({
      to: adminEmail,
      subject: `[Iletisim] ${subject}`,
      text: body,
      html: `<pre style="font-family: system-ui; white-space: pre-wrap;">${body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`,
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
