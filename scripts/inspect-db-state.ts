import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });

async function main() {
  await c.connect();
  const counts = await c.query<{ relation: string; n: string }>(`
    SELECT 'users' AS relation, COUNT(*)::text AS n FROM users UNION ALL
    SELECT 'dealers', COUNT(*)::text FROM dealers UNION ALL
    SELECT 'orders', COUNT(*)::text FROM orders UNION ALL
    SELECT 'products', COUNT(*)::text FROM products WHERE "isPublished" = true UNION ALL
    SELECT 'product_images', COUNT(*)::text FROM product_images
  `);
  console.log("=== Counts ===");
  for (const r of counts.rows) console.log(`  ${r.relation}: ${r.n}`);

  const orders = await c.query(`
    SELECT id, "orderNumber", status, total, "createdAt", "userId"
    FROM orders ORDER BY "createdAt" DESC LIMIT 10
  `);
  console.log("\n=== Latest 10 orders ===");
  for (const r of orders.rows) {
    console.log(
      `  ${r.orderNumber} | ${r.status} | ${r.total} | ${new Date(r.createdAt).toISOString()}`
    );
  }

  const users = await c.query(`
    SELECT id, email, role, "createdAt" FROM users ORDER BY "createdAt" DESC LIMIT 10
  `);
  console.log("\n=== Latest 10 users ===");
  for (const r of users.rows) {
    console.log(`  ${r.email} | ${r.role} | ${new Date(r.createdAt).toISOString()}`);
  }

  await c.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
