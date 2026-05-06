import "dotenv/config";
import pg from "pg";

async function main() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  await c.connect();
  const r = await c.query<{ createdAt: Date; to: string; subject: string; status: string; error: string | null }>(
    'SELECT "createdAt", "to", subject, status, error FROM email_logs ORDER BY "createdAt" DESC LIMIT 5'
  );
  r.rows.forEach((x) => {
    console.log(x.createdAt.toISOString().slice(0, 19), x.status.padEnd(8), x.to, "|", x.subject);
    if (x.error) console.log("  ERROR:", x.error.slice(0, 400));
  });
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
