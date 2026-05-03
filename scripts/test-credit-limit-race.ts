/**
 * Integration test: writeLedgerEntry with enforceCreditLimit must block
 * concurrent ORDER_DEBITs from collectively breaching the dealer's credit
 * limit. Sets up an isolated test dealer, fires N concurrent transactions,
 * and asserts the final balance + success count are correct.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { writeLedgerEntry } from "../src/lib/ledger";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TEST_EMAIL = "credit-limit-race-test@mastereducation.com.tr";

async function setup() {
  // Idempotent teardown first
  await teardown();
  const pwd = await bcrypt.hash("test-password-xyz", 4);
  const user = await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Credit Race Test",
      passwordHash: pwd,
      role: "DEALER",
    },
  });
  const dealer = await prisma.dealer.create({
    data: {
      userId: user.id,
      companyName: "Test Co",
      taxOffice: "Test",
      taxNumber: "0000000000",
      status: "APPROVED",
      creditLimit: 1000,
      currentBalance: 0,
    },
  });
  return { userId: user.id, dealerId: dealer.id };
}

async function teardown() {
  const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) return;
  const dealer = await prisma.dealer.findUnique({ where: { userId: user.id } });
  if (dealer) {
    await prisma.dealerLedger.deleteMany({ where: { dealerId: dealer.id } });
  }
  await prisma.user.delete({ where: { id: user.id } });
}

async function attemptDebit(dealerId: string, amount: number, tag: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const r = await writeLedgerEntry(tx, {
        dealerId,
        kind: "ORDER_DEBIT",
        amount,
        note: tag,
        enforceCreditLimit: true,
      });
      return { ok: true as const, balanceAfter: r.balanceAfter };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: msg };
  }
}

(async () => {
  console.log("\n=== Credit Limit Race Integration Test ===\n");
  const { dealerId } = await setup();

  // Scenario: limit=1000, 5 concurrent debits of 300 each. Only 3 should
  // succeed (900 total), the remaining 2 must be rejected.
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      attemptDebit(dealerId, 300, `debit-${i}`),
    ),
  );

  const successes = results.filter((r) => r.ok).length;
  const failures = results.filter((r) => !r.ok);
  const limitBreaches = failures.filter((r) =>
    "error" in r && r.error.includes("CREDIT_LIMIT_EXCEEDED"),
  ).length;

  const finalDealer = await prisma.dealer.findUniqueOrThrow({
    where: { id: dealerId },
    select: { currentBalance: true },
  });
  const finalBalance = Number(finalDealer.currentBalance);

  console.log(`Gonderilen paralel siparis : 5 x 300 TL (limit 1000 TL)`);
  console.log(`Basarili siparis           : ${successes} (beklenen: 3)`);
  console.log(`Reddedilen (limit asim)    : ${limitBreaches} (beklenen: 2)`);
  console.log(`Son bakiye                 : ${finalBalance} TL (beklenen: 900)`);

  const ledgerCount = await prisma.dealerLedger.count({ where: { dealerId } });
  console.log(`Ledger kayit sayisi        : ${ledgerCount} (beklenen: 3)`);

  let ok = true;
  if (successes !== 3) { console.log("✗ basarili siparis = 3 olmali"); ok = false; }
  if (limitBreaches !== 2) { console.log("✗ limit asim = 2 olmali"); ok = false; }
  if (finalBalance !== 900) { console.log("✗ bakiye = 900 olmali"); ok = false; }
  if (ledgerCount !== 3) { console.log("✗ ledger kaydi = 3 olmali"); ok = false; }

  if (ok) console.log("\n✓ RACE TEST BASARILI — kredi limiti atomik\n");
  else console.log("\n✗ RACE TEST BASARISIZ\n");

  await teardown();
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
})();
