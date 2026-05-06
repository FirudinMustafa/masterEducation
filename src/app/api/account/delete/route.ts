import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { flattenZodError } from "@/lib/validations";
import { anonymizeUser } from "@/lib/user-anonymize";
import { sendEmail, templateAccountDeleted } from "@/lib/email";

const schema = z.object({
  password: z.string().min(1),
  confirm: z.literal("HESABIMI SIL"),
});

/**
 * KVKK hesap silme akisi.
 *
 * Strateji:
 *   - Siparis gecmisi olanlar: email, name, phone anonimize — satirlar DB'de
 *     kalir (muhasebe kaydini bozmamak icin) ama tanimlayici bilgi gider.
 *     User row isPublished-benzeri "silinmis" duruma getirilir: email
 *     `deleted-<hash>@example.invalid` formatinda, password hash random.
 *   - Siparisi olmayanlar: kaskad silme (addresses, reviews, cartItems,
 *     passwordResetTokens; dealer record ON DELETE CASCADE).
 *
 * Admin silemez (son admin korumasi gibi). Gelen kullanici kendi sifresini
 * dogrulamali ve "HESABIMI SIL" yazmali (tipografi korumasi).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: flattenZodError(parsed.error) },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      dealer: { select: { id: true, status: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });
  }

  // Admin kendi hesabini silemez.
  if (user.role === "ADMIN") {
    return NextResponse.json(
      { error: "Admin hesabini bu akistan silemezsiniz." },
      { status: 403 }
    );
  }

  // Onaylanmis bayi ise once admin ile iletisime gecsin — cari bakiye
  // sebebiyle kendi kendine silme riski var.
  if (user.dealer && user.dealer.status === "APPROVED") {
    return NextResponse.json(
      {
        error:
          "Onayli bayi hesaplari dogrudan silinemez. Cari kapatma icin destek ile iletisime gecin.",
      },
      { status: 403 }
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Sifre dogru degil." }, { status: 403 });
  }

  const hasOrders = user._count.orders > 0;
  // E10 — Mail icin email/name silinmeden once yakalanir.
  const capturedEmail = user.email;
  const capturedName = user.name ?? "";
  const when = new Date();

  if (hasOrders) {
    const { originalEmail } = await anonymizeUser(user.id);
    logAudit({
      actorId: user.id,
      action: "USER_SELF_DELETE",
      entityType: "user",
      entityId: user.id,
      metadata: { strategy: "anonymize", hadOrders: true, originalEmail },
    });
    after(() => {
      const tpl = templateAccountDeleted({
        name: capturedName,
        mode: "anonymize",
        when,
      });
      void sendEmail({ ...tpl, to: capturedEmail });
    });
    return NextResponse.json({ ok: true, strategy: "anonymize" });
  }

  // Siparisi yok → tam silme (cascade)
  const originalEmail = user.email;
  await prisma.user.delete({ where: { id: user.id } });

  logAudit({
    actorId: null,
    action: "USER_SELF_DELETE",
    entityType: "user",
    entityId: user.id,
    metadata: { strategy: "hard", hadOrders: false, originalEmail },
  });

  after(() => {
    const tpl = templateAccountDeleted({
      name: capturedName,
      mode: "hard",
      when,
    });
    void sendEmail({ ...tpl, to: capturedEmail });
  });

  return NextResponse.json({ ok: true, strategy: "hard" });
}
