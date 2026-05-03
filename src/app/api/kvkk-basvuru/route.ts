import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail, escapeHtml } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { BRAND } from "@/lib/constants";

const REQUEST_TYPES = [
  "INFO_REQUEST",
  "CORRECTION",
  "DELETION",
  "TRANSFER_INFO",
  "OBJECTION",
  "DAMAGE_COMPENSATION",
  "OTHER",
] as const;

const REQUEST_TYPE_LABELS: Record<(typeof REQUEST_TYPES)[number], string> = {
  INFO_REQUEST: "Verilerin islenip islenmedigini ogrenme",
  CORRECTION: "Verilerin duzeltilmesi",
  DELETION: "Verilerin silinmesi / yok edilmesi",
  TRANSFER_INFO: "Verilerin aktarildigi ucuncu kisileri ogrenme",
  OBJECTION: "Otomatik sistem sonucuna itiraz",
  DAMAGE_COMPENSATION: "Zararin giderilmesi talebi",
  OTHER: "Diger",
};

const schema = z.object({
  fullName: z.string().min(2).max(120),
  tckn: z
    .string()
    .max(11)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && /^\d{10,11}$/.test(v) ? v : null)),
  email: z.email().toLowerCase(),
  phone: z.string().max(30).optional().or(z.literal("")).transform((v) => v || null),
  address: z.string().max(500).optional().or(z.literal("")).transform((v) => v || null),
  relationship: z.string().max(120).optional().or(z.literal("")).transform((v) => v || null),
  requestType: z.enum(REQUEST_TYPES),
  detail: z.string().min(10).max(3000),
  channel: z.enum(["email", "post"]),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  // Saatte 3 basvuru / IP — spam koruma. Yasal basvuru icin yeterli sinir.
  const rl = rateLimit(`kvkk-basvuru:${ip}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Cok fazla basvuru. Bir saat sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Gecersiz istek." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Lutfen zorunlu alanlari kontrol edin." },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const requestId = `KVKK-${Date.now().toString(36).toUpperCase()}`;
  const typeLabel = REQUEST_TYPE_LABELS[data.requestType];

  // Audit log — basvurunun kalici izini (anonim basvuru olabilir)
  logAudit({
    actorId: null,
    action: "KVKK_APPLICATION_SUBMITTED",
    entityType: "kvkk_application",
    entityId: requestId,
    metadata: {
      ip: ip.slice(0, 64),
      requestType: data.requestType,
      email: data.email,
      channel: data.channel,
    },
  });

  // Hem admin'e hem basvuru sahibine email
  after(async () => {
    const adminTo =
      process.env.ADMIN_EMAIL ||
      process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] ||
      BRAND.email;

    const adminSubject = `[KVKK] Yeni veri sahibi basvurusu — ${requestId}`;
    const adminHtml = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;color:#111;">
      <h2 style="margin:0 0 8px 0">Yeni KVKK Basvurusu</h2>
      <p style="color:#666;font-size:13px;margin:0 0 16px 0">Basvuru No: <strong>${escapeHtml(requestId)}</strong></p>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="background:#f5f5f5;width:160px"><strong>Ad Soyad</strong></td><td>${escapeHtml(data.fullName)}</td></tr>
        ${data.tckn ? `<tr><td style="background:#f5f5f5"><strong>TC Kimlik</strong></td><td>${escapeHtml(data.tckn)}</td></tr>` : ""}
        <tr><td style="background:#f5f5f5"><strong>Email</strong></td><td>${escapeHtml(data.email)}</td></tr>
        ${data.phone ? `<tr><td style="background:#f5f5f5"><strong>Telefon</strong></td><td>${escapeHtml(data.phone)}</td></tr>` : ""}
        ${data.address ? `<tr><td style="background:#f5f5f5"><strong>Adres</strong></td><td>${escapeHtml(data.address)}</td></tr>` : ""}
        ${data.relationship ? `<tr><td style="background:#f5f5f5"><strong>Iliskisi</strong></td><td>${escapeHtml(data.relationship)}</td></tr>` : ""}
        <tr><td style="background:#f5f5f5"><strong>Talep Turu</strong></td><td>${escapeHtml(typeLabel)}</td></tr>
        <tr><td style="background:#f5f5f5"><strong>Donus Yontemi</strong></td><td>${data.channel === "email" ? "E-posta" : "Posta"}</td></tr>
      </table>
      <h3 style="margin:24px 0 8px 0">Talep Detayi</h3>
      <pre style="background:#fafafa;padding:12px;border:1px solid #eee;border-radius:8px;white-space:pre-wrap;font-family:inherit;font-size:13px;">${escapeHtml(data.detail)}</pre>
      <p style="margin-top:24px;font-size:12px;color:#888">
        IP: ${escapeHtml(ip.slice(0, 64))} · Tarih: ${new Date().toLocaleString("tr-TR")}<br>
        KVKK madde 13/2 uyarinca <strong>30 gun</strong> icinde basvuranin yontemine gore donus yapilmalidir.
      </p>
    </body></html>`;
    await sendEmail({
      to: adminTo,
      subject: adminSubject,
      html: adminHtml,
    });

    // Basvurana onay
    const userSubject = `KVKK basvurunuz alindi — ${requestId}`;
    const userHtml = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;color:#111;">
      <h2 style="margin:0 0 8px 0">Basvurunuz alindi</h2>
      <p>Sayin ${escapeHtml(data.fullName)},</p>
      <p>6698 sayili KVKK kapsaminda yaptiginiz basvuru tarafimiza ulasti. Talebiniz, KVKK madde 13/2 uyarinca en gec <strong>30 gun</strong> icinde sonuclandirilarak ${data.channel === "email" ? "email" : "posta"} yoluyla tarafiniza iletilecektir.</p>
      <p style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:13px">
        <strong>Basvuru No:</strong> ${escapeHtml(requestId)}<br>
        <strong>Talep Turu:</strong> ${escapeHtml(typeLabel)}
      </p>
      <p>Sorulariniz icin <a href="mailto:${BRAND.email}">${BRAND.email}</a> adresine yazabilirsiniz.</p>
      <p style="margin-top:24px;font-size:12px;color:#888">${escapeHtml(BRAND.name)}</p>
    </body></html>`;
    await sendEmail({
      to: data.email,
      subject: userSubject,
      html: userHtml,
    });
  });

  return NextResponse.json({ ok: true, requestId }, { status: 201 });
}
