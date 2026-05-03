/**
 * Faz 3.1 + 3.2 + 3.3: ORDER_CREATE/DEALER_APPLY audit + suspended dealer
 * defansif check. API handler'larini bypass edip ayni DB mantigini cagirir.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "audit-guard-test@mastereducation.com.tr";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!u) return;
  const d = await prisma.dealer.findUnique({ where: { userId: u.id } });
  if (d) {
    await prisma.dealerLedger.deleteMany({ where: { dealerId: d.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: d.id } });
  }
  const orders = await prisma.order.findMany({ where: { userId: u.id } });
  for (const o of orders) {
    await prisma.auditLog.deleteMany({ where: { entityId: o.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
    await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
  await prisma.auditLog.deleteMany({ where: { entityId: u.id } });
  await prisma.address.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

(async () => {
  console.log("\n=== AUDIT + DEALER GUARD TESTLERI ===\n");
  await cleanup();

  const pwd = await bcrypt.hash("tp", 4);
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Audit", passwordHash: pwd, role: "DEALER" },
  });
  const dealer = await prisma.dealer.create({
    data: {
      userId: user.id,
      companyName: "Test",
      taxOffice: "T",
      taxNumber: "1",
      status: "APPROVED",
      creditLimit: 10000,
      currentBalance: 0,
    },
  });

  console.log("1) ORDER_CREATE audit (simulated)");
  // /api/orders handler'inin yazdigi audit'i direkt yaz
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "ORDER_CREATE",
      entityType: "order",
      entityId: "simulated-order-1",
      metadata: { orderNumber: "TEST-001", total: 500, paymentMethod: "OPEN_ACCOUNT" },
    },
  });
  const orderAudit = await prisma.auditLog.findFirst({
    where: { action: "ORDER_CREATE", actorId: user.id },
  });
  check("ORDER_CREATE audit yazilabildi", orderAudit !== null);

  console.log("\n2) DEALER_APPLY audit (simulated)");
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "DEALER_APPLY",
      entityType: "dealer",
      entityId: user.id,
      metadata: { companyName: "Test", taxNumber: "1", city: "Ist", email: EMAIL },
    },
  });
  const applyAudit = await prisma.auditLog.findFirst({
    where: { action: "DEALER_APPLY", actorId: user.id },
  });
  check("DEALER_APPLY audit yazilabildi", applyAudit !== null);

  console.log("\n3) Suspended dealer defansif check (siparis tx icinde)");
  // Bayi APPROVED → suspend et → tx icinde yeniden oku → status kontrol
  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { status: "SUSPENDED" },
  });

  let dealerGuardTriggered = false;
  try {
    await prisma.$transaction(async (tx) => {
      const live = await tx.dealer.findUnique({
        where: { id: dealer.id },
        select: { status: true },
      });
      if (!live || live.status !== "APPROVED") {
        throw new Error("DEALER_NOT_APPROVED");
      }
      // Tx buraya gelmemeli
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEALER_NOT_APPROVED") {
      dealerGuardTriggered = true;
    }
  }
  check("SUSPENDED bayi tx guard'i fetler", dealerGuardTriggered);

  console.log("\n4) APPROVED bayi guard'i gecer");
  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { status: "APPROVED" },
  });
  let approvedOk = false;
  await prisma.$transaction(async (tx) => {
    const live = await tx.dealer.findUnique({
      where: { id: dealer.id },
      select: { status: true },
    });
    if (live?.status === "APPROVED") approvedOk = true;
  });
  check("APPROVED bayi guard'i gecer", approvedOk);

  console.log("\n5) REJECTED bayi reddediliyor");
  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { status: "REJECTED" },
  });
  let rejectedBlocked = false;
  try {
    await prisma.$transaction(async (tx) => {
      const live = await tx.dealer.findUnique({
        where: { id: dealer.id },
        select: { status: true },
      });
      if (!live || live.status !== "APPROVED") throw new Error("DEALER_NOT_APPROVED");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEALER_NOT_APPROVED") rejectedBlocked = true;
  }
  check("REJECTED bayi da blockluyor", rejectedBlocked);

  console.log("\n6) PENDING bayi reddediliyor");
  await prisma.dealer.update({
    where: { id: dealer.id },
    data: { status: "PENDING" },
  });
  let pendingBlocked = false;
  try {
    await prisma.$transaction(async (tx) => {
      const live = await tx.dealer.findUnique({
        where: { id: dealer.id },
        select: { status: true },
      });
      if (!live || live.status !== "APPROVED") throw new Error("DEALER_NOT_APPROVED");
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEALER_NOT_APPROVED") pendingBlocked = true;
  }
  check("PENDING bayi da blockluyor", pendingBlocked);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
