/**
 * Bayi belge onay akisi: yeni uploaded belge → PENDING, admin approve/reject
 * durum geciste reviewNote + reviewedBy yazilir, audit log atilir.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "doc-review-test@mastereducation.com.tr";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!u) return;
  const d = await prisma.dealer.findUnique({ where: { userId: u.id } });
  if (d) {
    await prisma.dealerDocument.deleteMany({ where: { dealerId: d.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: d.id } });
  }
  await prisma.user.delete({ where: { id: u.id } });
}

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}`); failed++; }
}

(async () => {
  console.log("\n=== DEALER DOCUMENT REVIEW TEST ===\n");
  await cleanup();

  const pwd = await bcrypt.hash("tp", 4);
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Doc", passwordHash: pwd, role: "DEALER" },
  });
  const dealer = await prisma.dealer.create({
    data: {
      userId: user.id,
      companyName: "Test Co",
      taxOffice: "T",
      taxNumber: "1",
      status: "PENDING",
    },
  });

  // Simulate upload
  const doc = await prisma.dealerDocument.create({
    data: {
      dealerId: dealer.id,
      kind: "TAX_CERTIFICATE",
      filename: "test.pdf",
      origName: "vergi-levhasi.pdf",
      sizeBytes: 1024,
    },
  });

  console.log("1) Ilk yuklendiginde PENDING");
  check("status = PENDING", doc.status === "PENDING");
  check("reviewedAt null", doc.reviewedAt === null);
  check("reviewNote null", doc.reviewNote === null);

  console.log("\n2) Admin APPROVED");
  const approved = await prisma.dealerDocument.update({
    where: { id: doc.id },
    data: {
      status: "APPROVED",
      reviewNote: null,
      reviewedAt: new Date(),
      reviewedBy: "admin-user-id",
    },
  });
  check("status = APPROVED", approved.status === "APPROVED");
  check("reviewedAt dolu", approved.reviewedAt !== null);
  check("reviewedBy dolu", approved.reviewedBy === "admin-user-id");

  console.log("\n3) Admin REJECTED (not zorunlu kuralı API'de)");
  const rejected = await prisma.dealerDocument.update({
    where: { id: doc.id },
    data: {
      status: "REJECTED",
      reviewNote: "Belge okunur degil, tekrar yuklenmesi gerekiyor.",
      reviewedAt: new Date(),
      reviewedBy: "admin-user-id",
    },
  });
  check("status = REJECTED", rejected.status === "REJECTED");
  check("reviewNote dolu", rejected.reviewNote?.includes("okunur") ?? false);

  console.log("\n4) PENDING'e sifirlama (reviewedAt temizlenir)");
  const reset = await prisma.dealerDocument.update({
    where: { id: doc.id },
    data: {
      status: "PENDING",
      reviewedAt: null,
      reviewedBy: null,
    },
  });
  check("status = PENDING", reset.status === "PENDING");
  check("reviewedAt null", reset.reviewedAt === null);

  console.log("\n5) Status index query (filtreleme)");
  await prisma.dealerDocument.create({
    data: {
      dealerId: dealer.id,
      kind: "OTHER",
      filename: "t2.pdf",
      origName: "t2.pdf",
      sizeBytes: 500,
      status: "REJECTED",
      reviewNote: "Yanlis belge",
    },
  });
  const pendings = await prisma.dealerDocument.count({
    where: { dealerId: dealer.id, status: "PENDING" },
  });
  const rejecteds = await prisma.dealerDocument.count({
    where: { dealerId: dealer.id, status: "REJECTED" },
  });
  check("PENDING count = 1", pendings === 1);
  check("REJECTED count = 1", rejecteds === 1);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  await cleanup();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
})();
