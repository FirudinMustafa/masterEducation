/**
 * Faz 7.4 dogrulama: anonymizeUser helper'ini gercek DB'de test et.
 *
 * 1. Test kullanicisi olustur (siparissiz + adresi olan)
 * 2. anonymizeUser cagir
 * 3. Sonuclari kontrol et: email/name/phone/passwordHash anonimlestirilmis
 *    olmali, address kisisel veriler bosaltilmis olmali, cart bos olmali
 * 4. Test kullanicisini tamamen sil (cleanup)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

(async () => {
  let userId: string | null = null;
  try {
    // Helper'i test ortaminda calistirmak icin import et (env zaten yuklendi)
    const { anonymizeUser } = await import("../src/lib/user-anonymize");

    const email = `faz7-anon-test-${Date.now()}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Faz7 Test User",
        phone: "05551234567",
        passwordHash: await bcrypt.hash("testpass", 10),
        role: "CUSTOMER",
        addresses: {
          create: {
            label: "Ev",
            fullName: "Faz7 Test User",
            phone: "05551234567",
            city: "İstanbul",
            district: "Kadıköy",
            postalCode: "34710",
            addressLine: "Test cadde no 1",
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    userId = user.id;
    console.log("[1] User created:", user.email, "addresses:", user.addresses.length);

    await prisma.cartItem.create({
      data: {
        userId: user.id,
        productId: (await prisma.product.findFirst({ select: { id: true } }))!.id,
        quantity: 1,
      },
    });
    console.log("[2] Cart item added");

    const result = await anonymizeUser(user.id);
    console.log("[3] anonymizeUser ran. originalEmail =", result.originalEmail);

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      include: { addresses: true, cartItems: true },
    });
    if (!after) throw new Error("user vanished?!");

    const checks = [
      ["email", after.email.startsWith("deleted-")],
      ["email-domain", after.email.endsWith("@example.invalid")],
      ["name", after.name === "Silinen Kullanici"],
      ["phone", after.phone === null],
      ["addresses count", after.addresses.length === 1],
      ["address fullName", after.addresses[0]?.fullName === "Silinen Kullanici"],
      ["address phone", after.addresses[0]?.phone === ""],
      ["address line", after.addresses[0]?.addressLine === "[anonimlestirildi]"],
      ["address postal", after.addresses[0]?.postalCode === null],
      ["address label", after.addresses[0]?.label === null],
      ["cart cleared", after.cartItems.length === 0],
      ["pwd changed", !(await bcrypt.compare("testpass", after.passwordHash))],
    ] as const;

    let passed = 0;
    for (const [name, ok] of checks) {
      console.log(ok ? "  ✓" : "  ✗", name);
      if (ok) passed++;
    }
    console.log(`\n[4] Result: ${passed}/${checks.length} passed`);

    // Cleanup — tam silme (cascade ile address de gider)
    await prisma.user.delete({ where: { id: user.id } });
    console.log("[5] Test user deleted");
    userId = null;

    if (passed !== checks.length) {
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("FAIL:", e);
    process.exitCode = 1;
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
})();
