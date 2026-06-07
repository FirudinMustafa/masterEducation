import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const EMAIL = "admin@mastereducation.com.tr";
const TRY = "Master2026!Admin";

async function main() {
  const u = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true, role: true, passwordHash: true },
  });
  if (!u) { console.log("NOT FOUND"); return; }
  console.log({ id: u.id, email: u.email, role: u.role, hashPrefix: u.passwordHash.slice(0, 7) });
  const ok = await bcrypt.compare(TRY, u.passwordHash);
  console.log("bcrypt.compare:", ok);
}

main().catch(console.error).finally(() => prisma.$disconnect());
