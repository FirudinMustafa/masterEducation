import { NextRequest, NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/api-auth";
import { adminSetPasswordSchema, flattenZodError } from "@/lib/validations";
import { logAudit } from "@/lib/audit";
import { queueEmail, templateAdminSetPassword } from "@/lib/email";

/**
 * PATCH /api/admin/users/[id]/password — admin bir kullanıcının şifresini
 * belirler/sıfırlar. Bayilere giriş erişimi vermek/yenilemek için kullanılır.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireRole("ADMIN");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;

  const json = await req.json().catch(() => ({}));
  const parsed = adminSetPasswordSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Kullanıcı bulunamadı." },
      { status: 404 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });

  logAudit({
    actorId: gate.session.user.id,
    action: "ADMIN_SET_PASSWORD",
    entityType: "user",
    entityId: id,
    metadata: { email: user.email },
  });

  after(async () => {
    const base = process.env.NEXTAUTH_URL || "https://mastereducation.com.tr";
    const tpl = templateAdminSetPassword({
      name: user.name,
      password: parsed.data.password,
      loginUrl: `${base}/giris`,
    });
    queueEmail({ ...tpl, to: user.email });
  });

  return NextResponse.json({ ok: true, message: "Şifre güncellendi." });
}
