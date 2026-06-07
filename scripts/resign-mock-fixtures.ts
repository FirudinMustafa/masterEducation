#!/usr/bin/env tsx
/**
 * resign-mock-fixtures.ts
 *
 * Tur 1'de Iyzico + Shipentegra mock adapter'lar deterministik HMAC
 * doğrulamasına çevrildi (F-0001 / F-0002). Yeni TEST_SECRET'lar:
 *   - iyzico-mock-test-secret-2026   (Iyzico mock — verifyCallback HMAC-SHA1,
 *                                     verifyWebhookSignature HMAC-SHA256)
 *   - shipping-mock-test-secret-2026 (Shipentegra mock — HMAC-SHA256)
 *
 * Bu script `tests/` ağacını tarayıp HMAC imzalı fixture'ları (eğer varsa)
 * yeni secret'larla yeniden imzalar. Şu an codebase'de pre-existing signed
 * fixture YOK; ileride eklendiğinde tek kaynaktan bakım sağlar.
 *
 * Desteklenen formatlar (auto-detect):
 *   1. *.iyzico-callback.json  → { paymentId, conversationId, signature }
 *   2. *.iyzico-webhook.json   → { rawBody (string), signature }
 *   3. *.shipping-webhook.json → { rawBody (string), signature }
 *   4. tests/.../<name>.fixture.json with top-level meta.adapter alanı
 *      ("iyzico-callback" | "iyzico-webhook" | "shipping-webhook")
 *
 * Çalıştırma:
 *   npx tsx scripts/resign-mock-fixtures.ts
 *   npx tsx scripts/resign-mock-fixtures.ts --dry-run
 *
 * Çıktı: stdout'a özet (kaç dosya, hangi adapter, hangi algoritma).
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const IYZICO_SECRET = "iyzico-mock-test-secret-2026";
const SHIPPING_SECRET = "shipping-mock-test-secret-2026";

type Adapter = "iyzico-callback" | "iyzico-webhook" | "shipping-webhook";

interface FixtureFile {
  file: string;
  adapter: Adapter;
  raw: Record<string, unknown>;
}

function classifyByName(p: string): Adapter | null {
  const lower = p.toLowerCase();
  if (lower.endsWith(".iyzico-callback.json")) return "iyzico-callback";
  if (lower.endsWith(".iyzico-webhook.json")) return "iyzico-webhook";
  if (lower.endsWith(".shipping-webhook.json")) return "shipping-webhook";
  return null;
}

function classifyByMeta(obj: Record<string, unknown>): Adapter | null {
  const meta = obj.meta as Record<string, unknown> | undefined;
  const a = meta?.adapter;
  if (a === "iyzico-callback" || a === "iyzico-webhook" || a === "shipping-webhook") return a;
  return null;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      yield* walk(full);
    } else if (e.isFile() && e.name.endsWith(".json")) {
      yield full;
    }
  }
}

function sign(adapter: Adapter, raw: Record<string, unknown>): string {
  switch (adapter) {
    case "iyzico-callback": {
      const paymentId = String(raw.paymentId ?? "");
      const conversationId = String(raw.conversationId ?? "");
      return crypto
        .createHmac("sha1", IYZICO_SECRET)
        .update(`${paymentId}${conversationId}`)
        .digest("base64");
    }
    case "iyzico-webhook": {
      const rawBody = String(raw.rawBody ?? "");
      return crypto.createHmac("sha256", IYZICO_SECRET).update(rawBody).digest("hex");
    }
    case "shipping-webhook": {
      const rawBody = String(raw.rawBody ?? "");
      return crypto.createHmac("sha256", SHIPPING_SECRET).update(rawBody).digest("hex");
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const root = path.resolve(__dirname, "..", "tests");

  const found: FixtureFile[] = [];
  for await (const file of walk(root)) {
    let obj: unknown;
    try {
      obj = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      continue;
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) continue;

    const adapter =
      classifyByName(file) ?? classifyByMeta(obj as Record<string, unknown>);
    if (!adapter) continue;

    found.push({ file, adapter, raw: obj as Record<string, unknown> });
  }

  const counts: Record<Adapter, number> = {
    "iyzico-callback": 0,
    "iyzico-webhook": 0,
    "shipping-webhook": 0,
  };

  for (const f of found) {
    const newSig = sign(f.adapter, f.raw);
    const oldSig = String(f.raw.signature ?? "");
    if (oldSig === newSig) {
      console.log(`= ${f.adapter}  ${path.relative(process.cwd(), f.file)}  (zaten guncel)`);
      continue;
    }
    f.raw.signature = newSig;
    counts[f.adapter]++;
    if (!dryRun) {
      await fs.writeFile(f.file, JSON.stringify(f.raw, null, 2) + "\n", "utf8");
    }
    console.log(
      `${dryRun ? "+ [dry]" : "+"} ${f.adapter}  ${path.relative(process.cwd(), f.file)}  old=${oldSig.slice(0, 10)}...  new=${newSig.slice(0, 10)}...`,
    );
  }

  console.log("");
  console.log("=== Özet ===");
  console.log(`Iyzico callback (HMAC-SHA1, base64) : ${counts["iyzico-callback"]} dosya`);
  console.log(`Iyzico webhook  (HMAC-SHA256, hex)  : ${counts["iyzico-webhook"]} dosya`);
  console.log(`Shipping webhook (HMAC-SHA256, hex) : ${counts["shipping-webhook"]} dosya`);
  console.log(`Toplam taranan JSON : (tests/ icindeki tum .json)`);
  console.log(`Toplam guncellenen  : ${counts["iyzico-callback"] + counts["iyzico-webhook"] + counts["shipping-webhook"]}`);
  if (found.length === 0) {
    console.log("NOT: Pre-existing imzali fixture bulunamadi. Script gelecekte eklenecek fixture'lar icin hazir.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
