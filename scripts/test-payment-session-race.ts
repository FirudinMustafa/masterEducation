/**
 * Integration test: atomic claim on PaymentSession prevents duplicate
 * processing. We simulate concurrent worker txns each trying to claim the
 * same PENDING session and assert that exactly one succeeds.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TEST_EMAIL = "payment-race-test@mastereducation.com.tr";

async function setup() {
  await teardown();
  const pwd = await bcrypt.hash("test-pwd", 4);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Payment Race Test",
      passwordHash: pwd,
      role: "CUSTOMER",
    },
  });
  const addr = await prisma.address.create({
    data: {
      userId: user.id,
      fullName: "T",
      phone: "0500000000",
      city: "Istanbul",
      district: "T",
      addressLine: "T",
    },
  });
  const product = await prisma.product.findFirst({
    where: { isPublished: true, stockQuantity: { gt: 10 } },
  });
  if (!product) throw new Error("No product available");

  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-${Date.now()}`,
      userId: user.id,
      addressId: addr.id,
      status: "PENDING",
      paymentMethod: "CREDIT_CARD",
      paymentStatus: "PENDING",
      subtotal: 100,
      total: 100,
      shippingName: "T",
      shippingCity: "Istanbul",
      shippingAddress: "T",
      shippingPhone: "0",
      items: {
        create: {
          productId: product.id,
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          productName: product.name,
          productSku: product.sku,
        },
      },
    },
  });
  const token = crypto.randomBytes(24).toString("hex");
  const ps = await prisma.paymentSession.create({
    data: {
      orderId: order.id,
      token,
      amount: 100,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  return { orderId: order.id, psId: ps.id };
}

async function teardown() {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) return;
  const orders = await prisma.order.findMany({ where: { userId: user.id }, select: { id: true } });
  for (const o of orders) {
    await prisma.auditLog.deleteMany({ where: { entityId: o.id } });
    await prisma.paymentSession.deleteMany({ where: { orderId: o.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
  await prisma.address.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

/** Simulates one worker's attempt to "win" the session and write audit. */
async function attemptClaim(psId: string, orderId: string): Promise<"won" | "lost"> {
  try {
    return await prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentSession.updateMany({
        where: { id: psId, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status: "COMPLETED", processedAt: new Date() },
      });
      if (claimed.count === 0) return "lost";
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: "PAID", status: "PROCESSING" },
      });
      await tx.auditLog.create({
        data: {
          action: "ORDER_AUTO_APPROVE",
          entityType: "Order",
          entityId: orderId,
          metadata: { reason: "credit_card_paid" },
        },
      });
      return "won";
    });
  } catch {
    return "lost";
  }
}

(async () => {
  console.log("\n=== Payment Session Race Integration Test ===\n");
  const { psId, orderId } = await setup();

  // Fire 5 parallel claim attempts on the same PENDING session.
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, () => attemptClaim(psId, orderId)),
  );

  const wins = outcomes.filter((o) => o === "won").length;
  const losses = outcomes.filter((o) => o === "lost").length;

  const ps = await prisma.paymentSession.findUniqueOrThrow({ where: { id: psId } });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const audits = await prisma.auditLog.count({
    where: { entityId: orderId, action: "ORDER_AUTO_APPROVE" },
  });

  console.log(`5 paralel claim denemesi.`);
  console.log(`Kazanan            : ${wins} (beklenen: 1)`);
  console.log(`Kaybeden           : ${losses} (beklenen: 4)`);
  console.log(`PaymentSession     : ${ps.status} (beklenen: COMPLETED)`);
  console.log(`Order paymentStatus: ${order.paymentStatus} (beklenen: PAID)`);
  console.log(`Order status       : ${order.status} (beklenen: PROCESSING)`);
  console.log(`Audit kayit sayisi : ${audits} (beklenen: 1)`);

  let ok = true;
  if (wins !== 1) { console.log("✗ kazanan 1 olmali"); ok = false; }
  if (losses !== 4) { console.log("✗ kaybeden 4 olmali"); ok = false; }
  if (ps.status !== "COMPLETED") { console.log("✗ PS COMPLETED olmali"); ok = false; }
  if (audits !== 1) { console.log("✗ audit = 1 olmali"); ok = false; }
  if (order.paymentStatus !== "PAID") { console.log("✗ order PAID olmali"); ok = false; }

  if (ok) console.log("\n✓ PAYMENT RACE TEST BASARILI\n");
  else console.log("\n✗ PAYMENT RACE TEST BASARISIZ\n");

  await teardown();
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
})();
