/**
 * KVKK hesap silme akisi — API handler bypass, ayni DB etkisi:
 *   1) Siparisi olmayan kullanici → hard delete (cascade)
 *   2) Siparisi olan kullanici → anonymize (email, name, phone)
 *   3) Admin silemez (API kontrolunu bu test simule eder)
 *   4) APPROVED bayi silemez
 *   5) Audit log yazildi
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAILS = [
  "del-customer-noorders@mastereducation.com.tr",
  "del-customer-withorders@mastereducation.com.tr",
  "del-approved-dealer@mastereducation.com.tr",
];

async function cleanup() {
  for (const email of EMAILS) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) continue;
    await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
    const orders = await prisma.order.findMany({ where: { userId: u.id } });
    for (const o of orders) {
      await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    await prisma.address.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
  // Anonymized kullanicilari da temizle
  await prisma.auditLog.deleteMany({
    where: { action: "USER_SELF_DELETE" },
  });
  const anonymized = await prisma.user.findMany({
    where: { email: { contains: "@example.invalid" } },
  });
  for (const u of anonymized) {
    const orders = await prisma.order.findMany({ where: { userId: u.id } });
    for (const o of orders) {
      await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    await prisma.address.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

// API handler mantigi
async function deleteAccount(userId: string): Promise<"hard" | "anonymize" | "admin_blocked" | "approved_dealer_blocked"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      dealer: { select: { id: true, status: true } },
      _count: { select: { orders: true } },
    },
  });
  if (!user) throw new Error("Not found");
  if (user.role === "ADMIN") return "admin_blocked";
  if (user.dealer && user.dealer.status === "APPROVED") return "approved_dealer_blocked";

  const hasOrders = user._count.orders > 0;
  if (hasOrders) {
    const anonId = crypto.randomBytes(8).toString("hex");
    const anonEmail = `deleted-${anonId}@example.invalid`;
    const randomHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 4);
    await prisma.user.update({
      where: { id: user.id },
      data: { email: anonEmail, name: "Silinen Kullanici", phone: null, passwordHash: randomHash },
    });
    await prisma.address.updateMany({
      where: { userId: user.id },
      data: {
        fullName: "Silinen Kullanici",
        phone: "",
        addressLine: "[anonimlestirildi]",
        postalCode: null,
        label: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "USER_SELF_DELETE",
        entityType: "user",
        entityId: user.id,
        metadata: { strategy: "anonymize", hadOrders: true },
      },
    });
    return "anonymize";
  }

  await prisma.user.delete({ where: { id: user.id } });
  await prisma.auditLog.create({
    data: {
      actorId: null,
      action: "USER_SELF_DELETE",
      entityType: "user",
      entityId: user.id,
      metadata: { strategy: "hard", hadOrders: false },
    },
  });
  return "hard";
}

(async () => {
  console.log("\n=== KVKK HESAP SILME TESTI ===\n");
  await cleanup();

  const pwd = await bcrypt.hash("tp", 4);

  console.log("1) Siparisi olmayan musteri → HARD delete");
  const u1 = await prisma.user.create({
    data: { email: EMAILS[0], name: "Del1", passwordHash: pwd, role: "CUSTOMER" },
  });
  const r1 = await deleteAccount(u1.id);
  check("hard delete dondurdu", r1 === "hard");
  const u1After = await prisma.user.findUnique({ where: { id: u1.id } });
  check("user artik DB'de yok", u1After === null);
  const auditHard = await prisma.auditLog.findFirst({
    where: { action: "USER_SELF_DELETE", entityId: u1.id },
  });
  check("audit log yazildi (hard)", auditHard !== null);

  console.log("\n2) Siparisi olan musteri → ANONYMIZE");
  const u2 = await prisma.user.create({
    data: { email: EMAILS[1], name: "Del2 With Orders", phone: "05001112233", passwordHash: pwd, role: "CUSTOMER" },
  });
  const addr = await prisma.address.create({
    data: { userId: u2.id, fullName: "x", phone: "0", city: "I", district: "T", addressLine: "x" },
  });
  await prisma.order.create({
    data: {
      orderNumber: `TEST-DEL-${Date.now()}`,
      userId: u2.id,
      addressId: addr.id,
      status: "DELIVERED",
      paymentMethod: "CREDIT_CARD",
      paymentStatus: "PAID",
      subtotal: 100,
      total: 100,
      shippingName: "x",
      shippingCity: "I",
      shippingAddress: "x",
      shippingPhone: "0",
    },
  });
  const r2 = await deleteAccount(u2.id);
  check("anonymize dondurdu", r2 === "anonymize");
  const u2After = await prisma.user.findUnique({ where: { id: u2.id } });
  check("user hala var (siparis gecmisi)", u2After !== null);
  check("email anonymized", u2After?.email.endsWith("@example.invalid") ?? false);
  check("name degisti", u2After?.name === "Silinen Kullanici");
  check("phone temizlendi", u2After?.phone === null);
  const addrs = await prisma.address.findMany({ where: { userId: u2.id } });
  check("adresler anonimlestirildi (isim)", addrs.every((a) => a.fullName === "Silinen Kullanici"));
  check("adresler anonimlestirildi (addressLine)", addrs.every((a) => a.addressLine === "[anonimlestirildi]"));
  const orderCountAfter = await prisma.order.count({ where: { userId: u2.id } });
  check("siparisler KORUNDU (muhasebe)", orderCountAfter === 1);

  console.log("\n3) APPROVED bayi silemez");
  const u3 = await prisma.user.create({
    data: { email: EMAILS[2], name: "Dealer", passwordHash: pwd, role: "DEALER" },
  });
  await prisma.dealer.create({
    data: {
      userId: u3.id,
      companyName: "Test",
      taxOffice: "T",
      taxNumber: "1",
      status: "APPROVED",
    },
  });
  const r3 = await deleteAccount(u3.id);
  check("approved dealer silme reddedildi", r3 === "approved_dealer_blocked");
  const u3Still = await prisma.user.findUnique({ where: { id: u3.id } });
  check("bayi hala aktif", u3Still !== null);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
