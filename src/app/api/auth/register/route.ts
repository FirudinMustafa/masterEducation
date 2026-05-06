import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema, flattenZodError } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { issueEmailVerificationToken } from "@/lib/email-verification";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    // Email enumeration brute-force'u zorlastirmak icin sıkı rate limit:
    // saatte 5 kayıt denemesi / IP. Mesai ortamında bile yeterli.
    const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Cok fazla kayit denemesi. Daha sonra tekrar deneyin." },
        { status: 429 }
      );
    }

    const json = await request.json();
    // Honeypot — request body'de "website" alani dolu ise bot. Schema literal
    // bos string istiyor; doluysa zod fail'i 400 doner. Audit'e dusurmek
    // icin once tespit edip log'la, sonra normal validation'a brak.
    if (
      json &&
      typeof json === "object" &&
      typeof (json as { website?: unknown }).website === "string" &&
      (json as { website: string }).website.length > 0
    ) {
      logAudit({
        actorId: null,
        action: "AUTH_LOGIN_FAIL",
        entityType: "user",
        entityId: "honeypot",
        metadata: {
          source: "register-honeypot",
          ip: ip.slice(0, 64),
          length: (json as { website: string }).website.length,
        },
      });
      // Bot'u uyarmadan generic 201 don — saldirgan honeypot oldugunu fark
      // etmesin. Kullanici DB'ye yazilmaz.
      return NextResponse.json(
        { ok: true, message: "Kayit alindi." },
        { status: 201 }
      );
    }

    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: flattenZodError(parsed.error) },
        { status: 400 }
      );
    }

    const { name, email, phone, password, marketingConsent } = parsed.data;
    const now = new Date();

    const existing = await prisma.user.findUnique({
      where: { email },
      include: {
        _count: { select: { orders: true } },
      },
    });

    const passwordHash = await bcrypt.hash(password, 10);

    // Guest-upgrade patern: Eger email'de daha once auto-create olmus "guest
    // user" varsa (emailVerified=null + hic login yapilmamis — burada
    // sinyal olarak CUSTOMER + orders > 0 + emailVerified null aliyoruz),
    // kaydi devraliyoruz. Boylece guest siparislerden gelen musteri kayit olunca
    // eski siparisleri hesabina tasiniyor.
    let user;
    let suppressedEnumeration = false;
    if (existing) {
      const isGuestish =
        existing.role === "CUSTOMER" &&
        existing.emailVerified === null &&
        existing._count.orders > 0;
      if (!isGuestish) {
        // Email zaten kayitli — enumeration'a karsi GENERIC response don.
        // (Saldirgan, kayitli email'leri "Bu email zaten kayitli" mesajindan
        // ayirt edemez.) Audit'e bilgi düş — admin gerçek aktiviteyi görür.
        logAudit({
          actorId: existing.id,
          action: "AUTH_REGISTER_ATTEMPT_EXISTING",
          entityType: "user",
          entityId: existing.id,
          metadata: {
            source: "register-attempt-existing",
            ip: ip.slice(0, 64),
          },
        });
        suppressedEnumeration = true;
        user = existing; // response shape için
      } else {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: {
            name,
            phone,
            passwordHash,
            termsAcceptedAt: now,
            marketingConsent,
            marketingConsentAt: now,
          },
        });
        logAudit({
          actorId: user.id,
          action: "USER_PROFILE_UPDATE",
          entityType: "user",
          entityId: user.id,
          metadata: { source: "register-guest-upgrade", ordersClaimed: existing._count.orders },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: "CUSTOMER",
          termsAcceptedAt: now,
          marketingConsent,
          marketingConsentAt: now,
        },
      });
    }

    if (!suppressedEnumeration) {
      after(async () => {
        await issueEmailVerificationToken(user.id, user.name, user.email);
      });

      logAudit({
        actorId: user.id,
        action: "EMAIL_VERIFY_REQUEST",
        entityType: "user",
        entityId: user.id,
        metadata: { source: "register" },
      });

      // KVKK / sozlesme onay kaydi — basvurusuyla birlikte kalici iz.
      logAudit({
        actorId: user.id,
        action: "USER_CONSENT_GIVEN",
        entityType: "consent",
        entityId: user.id,
        metadata: {
          source: "register",
          ip: ip.slice(0, 64),
          terms: true,
          kvkk: true,
          marketing: marketingConsent,
        },
      });
    }

    // Generic response: gerçek yeni kayit ile zaten-var olan email ayirt edilemez.
    return NextResponse.json(
      { ok: true, message: "Kayit alindi. Email kutunuzu dogrulama linki icin kontrol edin." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Kayit sirasinda bir hata olustu." },
      { status: 500 }
    );
  }
}
