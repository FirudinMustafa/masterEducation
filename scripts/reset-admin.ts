import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const NEW_PASSWORD = "Master2026!Admin";
const EMAIL = "admin@mastereducation.com.tr";

async function main() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, role: "ADMIN" },
    create: { email: EMAIL, passwordHash: hash, name: "Admin", role: "ADMIN" },
  });
  console.log(`OK: ${user.email} (role=${user.role})`);
  console.log(`Password: ${NEW_PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
