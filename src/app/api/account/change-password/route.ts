import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { changePasswordSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { queueEmail, templatePasswordChanged } from "@/lib/email";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = changePasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Mevcut sifre dogru degil." },
      { status: 403 }
    );
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: hash },
  });

  // Kullanicinin diger acik password reset tokenlarini iptal et
  await prisma.passwordResetToken.updateMany({
    where: { userId: session.user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  logAudit({
    actorId: session.user.id,
    action: "USER_PASSWORD_CHANGE",
    entityType: "user",
    entityId: session.user.id,
  });

  // E8 — Sifre degisti guvenlik bildirimi (ATO erken algilamasi).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const userAgent = req.headers.get("user-agent");
  const userEmail = user.email;
  const userName = user.name;
  after(() => {
    if (!userEmail) return;
    const tpl = templatePasswordChanged({
      name: userName ?? "",
      when: new Date(),
      ip: ip ? ip.slice(0, 64) : null,
      userAgent: userAgent ?? null,
    });
    queueEmail({ ...tpl, to: userEmail });
  });

  return NextResponse.json({ ok: true });
}
