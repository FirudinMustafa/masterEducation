import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const PASSWORD = "QaFixture2026!";
const TS_TAG = "qa-fixture";

const fixtures = [
  { email: "qa-fixture-approved@qa.local",  status: "APPROVED",  paymentTerms: "OPEN_ACCOUNT", creditLimit: 50000, companyName: "QA Fixture Approved Co", taxNumber: "1111111111", taxOffice: "Kadikoy VD" },
  { email: "qa-fixture-pending@qa.local",   status: "PENDING",   paymentTerms: "PREPAID",      creditLimit: 0,     companyName: "QA Fixture Pending Co",  taxNumber: "2222222222", taxOffice: "Cankaya VD" },
  { email: "qa-fixture-rejected@qa.local",  status: "REJECTED",  paymentTerms: "PREPAID",      creditLimit: 0,     companyName: "QA Fixture Rejected Co", taxNumber: "3333333333", taxOffice: "Konak VD" },
  { email: "qa-fixture-suspended@qa.local", status: "SUSPENDED", paymentTerms: "PREPAID",      creditLimit: 0,     companyName: "QA Fixture Suspended Co",taxNumber: "4444444444", taxOffice: "Osmangazi VD" },
] as const;

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Plain customer
  const cust = await prisma.user.upsert({
    where: { email: "qa-fixture-customer@qa.local" },
    update: { passwordHash: hash, emailVerified: new Date() },
    create: {
      email: "qa-fixture-customer@qa.local",
      passwordHash: hash,
      name: "QA Customer",
      role: "CUSTOMER",
      emailVerified: new Date(),
    },
  });
  console.log(`OK customer: ${cust.email}`);

  for (const f of fixtures) {
    const user = await prisma.user.upsert({
      where: { email: f.email },
      update: { passwordHash: hash, emailVerified: new Date() },
      create: {
        email: f.email,
        passwordHash: hash,
        // Don't put the status word in the display name — QA regexes watching
        // /bayi for "pending|rejected|suspended" keywords would match the user's
        // own name. Use a status code instead (P/A/R/S).
        name: `QA Dealer ${f.status[0]}`,
        role: "DEALER",
        emailVerified: new Date(),
      },
    });

    const dealer = await prisma.dealer.upsert({
      where: { userId: user.id },
      update: {
        status: f.status,
        paymentTerms: f.paymentTerms,
        creditLimit: f.creditLimit,
        companyName: f.companyName,
      },
      create: {
        userId: user.id,
        companyName: f.companyName,
        taxNumber: f.taxNumber,
        taxOffice: f.taxOffice,
        status: f.status,
        paymentTerms: f.paymentTerms,
        creditLimit: f.creditLimit,
        currentBalance: 0,
      },
    });

    console.log(`OK dealer ${f.status}: ${user.email} (dealerId=${dealer.id})`);
  }

  console.log("\nAll fixtures ready. Password for all: " + PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
