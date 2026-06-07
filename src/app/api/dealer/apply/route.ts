import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { dealerApplySchema, flattenZodError } from "@/lib/validations";
import {
  queueEmail,
  templateDealerApplicationReceived,
  templateDealerApplicationAdminNotice,
} from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { issueEmailVerificationToken } from "@/lib/email-verification";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/constants";
import { getClientIp } from "@/lib/get-client-ip";

export async function POST(request: NextRequest) {
  try {
    // SECURITY: trusted-proxy last-hop (raw XFF bypass'a kapali, QA 2026-05-18)
    const ip = getClientIp(request.headers);
    const rl = rateLimit(`dealer-apply:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Çok fazla basvuru. Daha sonra tekrar deneyin." },
        { status: 429 }
      );
    }

    const json = await request.json();
    const parsed = dealerApplySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: flattenZodError(parsed.error) },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      phone,
      password,
      companyName,
      taxOffice,
      taxNumber,
      tradeRegNo,
      contactPerson,
      city,
      district,
      addressLine,
      marketingConsent,
    } = parsed.data;
    const now = new Date();

    // Bayi-only B2B sistem: kafa karışıklığını önlemek için var olan e-postada
    // sessiz "başarı" yerine net hata döndürülür. (Müşteri kaydı kapalı olduğu
    // için e-posta enumeration riski düşük; net mesaj UX'i çok daha iyi.)
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      logAudit({
        actorId: existing.id,
        action: "DEALER_APPLY",
        entityType: "dealer",
        entityId: existing.id,
        metadata: { source: "apply-attempt-existing", ip: ip.slice(0, 64) },
      });
      return NextResponse.json(
        {
          error:
            "Bu e-posta ile zaten bir başvuru/hesap mevcut. Giriş yapın ya da farklı bir e-posta ile başvurun.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash,
        role: "DEALER",
        termsAcceptedAt: now,
        marketingConsent,
        marketingConsentAt: now,
        dealer: {
          create: {
            companyName,
            taxOffice,
            taxNumber,
            tradeRegNo,
            contactPerson,
            status: "PENDING",
          },
        },
        addresses: {
          create: {
            label: "Fatura Adresi",
            fullName: companyName,
            phone: phone,
            city,
            district,
            addressLine,
            isDefault: true,
          },
        },
      },
    });

    logAudit({
      actorId: user.id,
      action: "DEALER_APPLY",
      entityType: "dealer",
      entityId: user.id,
      metadata: { companyName, taxNumber, city, email },
    });

    logAudit({
      actorId: user.id,
      action: "USER_CONSENT_GIVEN",
      entityType: "consent",
      entityId: user.id,
      metadata: {
        source: "dealer-apply",
        ip: ip.slice(0, 64),
        terms: true,
        kvkk: true,
        marketing: marketingConsent,
      },
    });

    after(async () => {
      // Email doğrulama linki — customer register ile aynı flow.
      // Bayi onaylanmadan önce email doğrulayabilsin.
      await issueEmailVerificationToken(user.id, name, email);
      const notice = templateDealerApplicationReceived(name);
      queueEmail({ ...notice, to: email });

      // E2 — Admin'e yeni bayi basvurusu bildirimi. Admin panele bakana
      // kadar saatlerce bekleyebilir; açıklayicidir.
      const adminTo = env.ADMIN_EMAIL ?? BRAND.email;
      if (adminTo) {
        const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
        const adminTpl = templateDealerApplicationAdminNotice({
          companyName,
          contactPerson,
          email,
          phone,
          taxOffice,
          taxNumber,
          panelUrl: `${base}/admin/bayiler/${user.id}`,
        });
        queueEmail({ ...adminTpl, to: adminTo });
      }
    });

    return NextResponse.json(
      { id: user.id, message: "Basvurunuz alindi." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Dealer application error:", error);
    return NextResponse.json(
      { error: "Basvuru sirasinda bir hata oluştu." },
      { status: 500 }
    );
  }
}
