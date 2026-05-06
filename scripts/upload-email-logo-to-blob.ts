/**
 * Mail templatelerinin kullandigi logoyu Vercel Blob'a yukler ve kalici public URL doner.
 * Domain WordPress'te oldugu icin `https://mastereducation.com.tr/me-logo-v2.png`
 * 404 doner -> mail clientlar logoyu acmaz. Cozum: Blob'da sabit URL.
 */
import "dotenv/config";
import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN env yok.");
  process.exit(1);
}

async function main() {
  const file = path.join(process.cwd(), "public", "me-logo-v2.png");
  const buf = await readFile(file);
  const result = await put("email-assets/me-logo-v2.png", buf, {
    access: "public",
    contentType: "image/png",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    allowOverwrite: true,
    addRandomSuffix: false,
    token,
  });
  console.log("✓ Yuklendi");
  console.log("  URL:", result.url);
  console.log("  Pathname:", result.pathname);
  console.log("\n.env'e ekle:");
  console.log(`EMAIL_LOGO_URL="${result.url}"`);
}
main().catch((e) => { console.error(e); process.exit(1); });
