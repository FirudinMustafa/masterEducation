import "dotenv/config";
import pg from "pg";

async function main() {
  console.log("=== EMAIL DIAGNOSTIC ===\n");

  console.log("Env durumu:");
  const env = {
    NODE_ENV: process.env.NODE_ENV ?? "(unset)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || "(BOS)",
    SMTP_HOST: process.env.SMTP_HOST || "(YOK)",
    SMTP_PORT: process.env.SMTP_PORT || "(YOK)",
    SMTP_USER: process.env.SMTP_USER ? "(SET)" : "(YOK)",
    SMTP_PASS: process.env.SMTP_PASS ? "(SET)" : "(YOK)",
    SMTP_FROM: process.env.SMTP_FROM || "(YOK)",
    RESEND_API_KEY: process.env.RESEND_API_KEY ? "(SET)" : "(YOK)",
  };
  Object.entries(env).forEach(([k, v]) => console.log(` ${k.padEnd(18)} ${v}`));

  const transporterReady =
    !!(process.env.SMTP_HOST && process.env.SMTP_PORT &&
       process.env.SMTP_USER && process.env.SMTP_PASS);
  console.log(`\nMail transporter: ${transporterReady ? "AKTIF" : "DRYRUN (eksik env -> mail GITMIYOR)"}`);

  const base = process.env.NEXTAUTH_URL || "";
  console.log(`Logo URL: ${base || "(NEXTAUTH_URL bos)"}/me-logo-v2.png`);
  if (!base) {
    console.log("  -> SORUN: NEXTAUTH_URL bos -> URL relative kaliyor, mail clientlar logo'yu gosteremez.");
  } else if (base.startsWith("http://localhost") || base.startsWith("http://127")) {
    console.log("  -> SORUN: localhost URL. Alici mail client bu URL'e ulasamaz.");
  } else if (base.startsWith("http://")) {
    console.log("  -> SORUN: HTTP non-HTTPS. Gmail/Outlook block eder.");
  } else {
    console.log("  -> URL OK (HTTPS public).");
  }

  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dbUrl) { console.log("\nDATABASE_URL yok, log query atlandi."); return; }
  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
  } catch (e) {
    console.log("\nDB baglanti hatasi:", (e as Error).message);
    return;
  }

  const logs = await client.query<{
    createdAt: Date; to: string; subject: string; status: string; error: string | null;
  }>(`SELECT "createdAt","to",subject,status,error FROM email_logs ORDER BY "createdAt" DESC LIMIT 10`);
  console.log("\nSon 10 EmailLog kaydi:");
  if (logs.rows.length === 0) console.log(" (kayit yok)");
  logs.rows.forEach(l =>
    console.log(` ${new Date(l.createdAt).toISOString().slice(0,19)}  ${l.status.padEnd(15)}  ${l.to.slice(0,35).padEnd(35)}  ${l.subject.slice(0,50)}`)
  );

  const counts = await client.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM email_logs GROUP BY status ORDER BY count DESC`
  );
  console.log("\nTum zaman dagilim:");
  counts.rows.forEach(c => console.log(` ${c.status.padEnd(20)} ${c.count}`));
  const total = counts.rows.reduce((a, b) => a + Number(b.count), 0);
  const sent = Number(counts.rows.find(c => c.status === "SENT")?.count ?? 0);
  console.log(`\nOzet: toplam ${total}, gercekten gonderilen (SENT) ${sent}`);
  if (total > 0 && sent === 0)
    console.log(" -> Sistem kuruldugundan beri TEK BIR mail bile gercek gitmedi (hepsi DRYRUN).");

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
