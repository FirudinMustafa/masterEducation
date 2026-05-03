import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { issueEmailVerificationToken } from "@/lib/email-verification";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  // Spam koruma: kullanici basina 3 request / saat
  const rl = rateLimit(`verify-resend:${session.user.id}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Cok sik istek. Bir saat sonra tekrar deneyin." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, emailVerified: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }
  if (user.emailVerified) {
    return NextResponse.json(
      { error: "Email adresiniz zaten dogrulanmis." },
      { status: 400 }
    );
  }

  await issueEmailVerificationToken(session.user.id, user.name, user.email);

  logAudit({
    actorId: session.user.id,
    action: "EMAIL_VERIFY_REQUEST",
    entityType: "user",
    entityId: session.user.id,
    metadata: { source: "resend" },
  });

  return NextResponse.json({ ok: true });
}
