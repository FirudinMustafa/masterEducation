import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { profileUpdateSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { issueEmailVerificationToken } from "@/lib/email-verification";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = profileUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { name, phone, email, currentPassword } = parsed.data;

  // Email degisiyorsa baska bir kullanicida bu email olmasin.
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerified: true, passwordHash: true },
  });
  if (!current) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }

  // Account takeover engeli: email değişimi current password zorunlu.
  // Saldırgan session token'ı çalsa bile parolayı bilmeden email'i değiştiremez.
  if (email !== current.email) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Email degisikligi icin mevcut sifrenizi girmelisiniz." },
        { status: 400 }
      );
    }
    const ok = await bcrypt.compare(currentPassword, current.passwordHash);
    if (!ok) {
      logAudit({
        actorId: session.user.id,
        action: "USER_PROFILE_UPDATE",
        entityType: "user",
        entityId: session.user.id,
        metadata: { source: "email-change-attempt-bad-password" },
      });
      return NextResponse.json(
        { error: "Mevcut sifre dogru degil." },
        { status: 403 }
      );
    }

    const dup = await prisma.user.findUnique({ where: { email } });
    if (dup && dup.id !== session.user.id) {
      return NextResponse.json(
        { error: "Bu email adresi baska bir hesapta kayitli." },
        { status: 409 }
      );
    }
  }

  // Email degisirse verification reset olur (verification flow Faz 5.2'de aktif)
  const emailChanged = email !== current.email;
  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      phone,
      email,
      ...(emailChanged ? { emailVerified: null } : {}),
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  logAudit({
    actorId: session.user.id,
    action: "USER_PROFILE_UPDATE",
    entityType: "user",
    entityId: session.user.id,
    metadata: { emailChanged, fromEmail: emailChanged ? current.email : undefined },
  });

  if (emailChanged) {
    const userId = session.user.id;
    after(async () => {
      await issueEmailVerificationToken(userId, updated.name, email);
    });
  }

  return NextResponse.json({ ok: true, user: updated, emailChanged });
}
