import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const EMAIL = "admin@mastereducation.com.tr";
const NEW_PASSWORD = "Master2026!Admin";

(async () => {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash: hash, role: "ADMIN" },
    create: { email: EMAIL, passwordHash: hash, name: "Admin", role: "ADMIN" },
  });
  console.log(`OK: ${user.email} (role=${user.role})`);
  console.log(`Password: ${NEW_PASSWORD}`);
  await prisma.$disconnect();
  await pool.end();
})();
