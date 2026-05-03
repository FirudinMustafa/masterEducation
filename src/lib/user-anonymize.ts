import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export interface AnonymizeResult {
  anonEmail: string;
  originalEmail: string;
}

/**
 * Bir kullaniciyi DB'de korur ama tum kisisel verisini siler/replace eder.
 * Self-delete (KVKK) ve admin-delete (siparis varsa hard-delete blocked)
 * pathlerinde ortak kullanilir.
 *
 * Davranis:
 *  - email → "deleted-<rand>@example.invalid"
 *  - name → "Silinen Kullanici"
 *  - phone → null
 *  - passwordHash → rastgele (girilemez)
 *  - addresses (FK by orders) → kisisel alanlar bosaltilir
 *  - cartItems → silinir (kisisel ilgi)
 *  - passwordResetToken → silinir
 *  - dealer record → status SUSPENDED'a alinir (varsa); cari/siparis FK'leri
 *    bozulmaz. Sirket adi/vergi/iletisim de bosaltilir.
 *
 * Audit log CALLER'in sorumlulugunda — endpoint kendi action degerini yazsin
 * (USER_SELF_DELETE veya USER_ADMIN_DELETE).
 */
export async function anonymizeUser(userId: string): Promise<AnonymizeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, dealer: { select: { id: true } } },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const anonId = crypto.randomBytes(8).toString("hex");
  const anonEmail = `deleted-${anonId}@example.invalid`;
  const randomHash = await bcrypt.hash(
    crypto.randomBytes(16).toString("hex"),
    10
  );

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonEmail,
        name: "Silinen Kullanici",
        phone: null,
        passwordHash: randomHash,
      },
    });
    await tx.address.updateMany({
      where: { userId },
      data: {
        fullName: "Silinen Kullanici",
        phone: "",
        addressLine: "[anonimlestirildi]",
        postalCode: null,
        label: null,
      },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.cartItem.deleteMany({ where: { userId } });

    if (user.dealer) {
      await tx.dealer.update({
        where: { id: user.dealer.id },
        data: {
          status: "SUSPENDED",
          companyName: "[anonimlestirildi]",
          taxOffice: "",
          taxNumber: "",
          tradeRegNo: null,
          contactPerson: null,
          notes: null,
          rejectionReason: null,
        },
      });
    }
  });

  return { anonEmail, originalEmail: user.email };
}
