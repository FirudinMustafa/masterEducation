import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import path from "node:path";

const RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-2228";
const LOG_PATH = path.resolve(process.cwd(), `qa-run/${RUN_DIR}/cleanup.log`);

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const log: string[] = [];
  log.push(`# Cleanup log — ${new Date().toISOString()} — dryRun=${DRY_RUN}`);

  // 1. Count test users matching pattern (qa-{anything}@qa.local), EXCEPT fixtures
  const pattern = "qa-%@qa.local";
  const keepEmails = [
    "qa-fixture-customer@qa.local",
    "qa-fixture-approved@qa.local",
    "qa-fixture-pending@qa.local",
    "qa-fixture-rejected@qa.local",
    "qa-fixture-suspended@qa.local",
  ];

  const all = await prisma.user.findMany({
    where: { email: { contains: "@qa.local" } },
    select: { id: true, email: true, role: true },
  });

  const toDelete = all.filter((u) => !keepEmails.includes(u.email));
  const toKeep = all.filter((u) => keepEmails.includes(u.email));

  log.push(`\nUsers matching @qa.local: ${all.length}`);
  log.push(`Fixtures to KEEP: ${toKeep.length}`);
  log.push(`To DELETE (test runs): ${toDelete.length}`);

  for (const u of toDelete.slice(0, 30)) log.push(`  - ${u.email} (role=${u.role})`);
  if (toDelete.length > 30) log.push(`  ... and ${toDelete.length - 30} more`);

  if (DRY_RUN) {
    log.push(`\nDRY_RUN — no deletion performed.`);
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.writeFileSync(LOG_PATH, log.join("\n"));
    console.log(log.join("\n"));
    return;
  }

  // 2. Delete (cascade should handle orders, addresses, reviews, dealer records via FK)
  let totalDeleted = 0;
  const errors: string[] = [];
  for (const u of toDelete) {
    try {
      await prisma.user.delete({ where: { id: u.id } });
      totalDeleted++;
    } catch (e) {
      errors.push(`${u.email}: ${(e as Error).message}`);
    }
  }

  log.push(`\nDeleted: ${totalDeleted}`);
  log.push(`Errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) log.push(`  ! ${e}`);

  // 3. Cleanup orphan emails in EmailLog for qa-*@qa.local recipients
  const orphans = await prisma.emailLog.deleteMany({
    where: { to: { contains: "@qa.local" }, NOT: { to: { in: keepEmails } } },
  });
  log.push(`\nOrphan EmailLog rows deleted: ${orphans.count}`);

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, log.join("\n"));
  console.log(log.join("\n"));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
