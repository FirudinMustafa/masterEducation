import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { dealerApplySchema, flattenZodError } from "@/lib/validations";
import { queueEmail, templateDealerApplicationReceived } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { issueEmailVerificationToken } from "@/lib/email-verification";

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = rateLimit(`dealer-apply:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Cok fazla basvuru. Daha sonra tekrar deneyin." },
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

    // Enumeration suppression: var olan email için generic 201 dönülür.
    // (Customer register ile aynı pattern — saldırgan kayıtlı email'leri
    // 409 / "zaten kayitli" mesajlarından ayırt edemez.) Audit'e iz düşülür.
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
        { id: null, message: "Basvurunuz alindi." },
        { status: 201 }
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
    });

    return NextResponse.json(
      { id: user.id, message: "Basvurunuz alindi." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Dealer application error:", error);
    return NextResponse.json(
      { error: "Basvuru sirasinda bir hata olustu." },
      { status: 500 }
    );
  }
}
