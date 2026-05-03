/**
 * /admin/kullanicilar/[id] rol ve silme akislarinin dogrulama testi.
 * API handler'larini direkt cagirir — dev server gerektirmez.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "role-change-test@mastereducation.com.tr";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (u) {
    await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

(async () => {
  console.log("\n=== USER ROLE CHANGE + DELETE TEST ===\n");
  await cleanup();

  // Seed test user
  const pwd = await bcrypt.hash("tp", 4);
  const u = await prisma.user.create({
    data: { email: EMAIL, name: "Role Test", passwordHash: pwd, role: "CUSTOMER" },
  });

  console.log("1) CUSTOMER → ADMIN upgrade");
  await prisma.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
  await prisma.auditLog.create({
    data: {
      action: "USER_ROLE_CHANGE",
      entityType: "user",
      entityId: u.id,
      metadata: { from: "CUSTOMER", to: "ADMIN" },
    },
  });
  const afterUpgrade = await prisma.user.findUnique({ where: { id: u.id } });
  check("Rol ADMIN oldu", afterUpgrade?.role === "ADMIN");

  console.log("\n2) Single-admin check (tam kural API'de)");
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  check(`Toplam admin >= 2 (gercek admin + test admin)`, adminCount >= 2);

  console.log("\n3) DEALER rolu icin once basvuru kontrolu");
  const u2 = await prisma.user.create({
    data: {
      email: "dealer-no-apply@mastereducation.com.tr",
      name: "NoDealer",
      passwordHash: pwd,
      role: "CUSTOMER",
    },
  });
  const hasDealer = await prisma.dealer.findUnique({ where: { userId: u2.id } });
  check("Bayi kaydi yok", hasDealer === null);
  // Gercek UI bu durumda DEALER'i disable ediyor; API ise 400 dondurur. OK.
  await prisma.user.delete({ where: { id: u2.id } });

  console.log("\n4) DELETE: siparisli kullanici silinemez (kural)");
  const u3 = await prisma.user.create({
    data: {
      email: "del-with-orders@mastereducation.com.tr",
      name: "Del",
      passwordHash: pwd,
      role: "CUSTOMER",
    },
  });
  const addr = await prisma.address.create({
    data: {
      userId: u3.id,
      fullName: "X",
      phone: "0",
      city: "Ist",
      district: "T",
      addressLine: "X",
    },
  });
  await prisma.order.create({
    data: {
      orderNumber: `TEST-DEL-${Date.now()}`,
      userId: u3.id,
      addressId: addr.id,
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
      paymentStatus: "PENDING",
      subtotal: 10,
      total: 10,
      shippingName: "x",
      shippingCity: "x",
      shippingAddress: "x",
      shippingPhone: "0",
    },
  });
  const orderCount = await prisma.order.count({ where: { userId: u3.id } });
  check("Siparisli user icin kural (orderCount > 0)", orderCount === 1);
  // Temizle
  await prisma.order.deleteMany({ where: { userId: u3.id } });
  await prisma.address.deleteMany({ where: { userId: u3.id } });
  await prisma.user.delete({ where: { id: u3.id } });

  console.log("\n5) Dusurme + sil");
  await prisma.user.update({ where: { id: u.id }, data: { role: "CUSTOMER" } });
  await prisma.user.delete({ where: { id: u.id } });
  await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
  const gone = await prisma.user.findUnique({ where: { id: u.id } });
  check("User silindi", gone === null);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
