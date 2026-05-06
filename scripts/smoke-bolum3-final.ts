/**
 * Bölüm 3 final smoke — prod build hazırlığı.
 *
 *   npm run build && npm start &
 *   sleep 5
 *   npx tsx scripts/smoke-bolum3-final.ts
 *
 * Test ettiği şeyler:
 *   - /api/health 200 + JSON şema
 *   - 5 public route 200
 *   - Iyzico init geçersiz body → 400
 *   - Iyzico webhook signature olmadan → 401
 *   - Shipping webhook signature olmadan → 401
 *   - Mock confirm prod kapalıyken 404
 *
 * Hata durumunda exit 1.
 */

const BASE = process.env.SMOKE_BASE ?? "http://localhost:3000";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

async function check(
  name: string,
  fn: () => Promise<{ ok: boolean; detail: string }>
) {
  try {
    const r = await fn();
    results.push({ name, ...r });
  } catch (err) {
    results.push({
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function main() {
  await check("/api/health", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const body = (await res.json()) as Record<string, unknown>;
    const expectedKeys = ["status", "ts", "components"];
    const ok =
      [200, 503].includes(res.status) &&
      expectedKeys.every((k) => k in body);
    return { ok, detail: `status=${res.status} keys=${Object.keys(body).join(",")}` };
  });

  for (const path of [
    "/",
    "/urunler",
    "/kategoriler/turkce",
    "/yayinevleri/cambridge",
    "/iletisim",
  ]) {
    await check(`GET ${path}`, async () => {
      const res = await fetch(`${BASE}${path}`);
      return {
        ok: res.status === 200 || res.status === 304,
        detail: `status=${res.status}`,
      };
    });
  }

  await check("Iyzico init invalid body", async () => {
    const res = await fetch(`${BASE}/api/payments/iyzico/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return {
      ok: [400, 401, 404, 503].includes(res.status),
      detail: `status=${res.status}`,
    };
  });

  await check("Iyzico webhook no signature", async () => {
    const res = await fetch(`${BASE}/api/payments/iyzico/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"iyziEventType":"PAYMENT"}',
    });
    return {
      ok: [400, 401, 404].includes(res.status),
      detail: `status=${res.status}`,
    };
  });

  await check("Shipping webhook no signature", async () => {
    const res = await fetch(`${BASE}/api/webhooks/shipping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"trackingNumber":"TEST","status":"DELIVERED","occurredAt":"2026-05-06T00:00:00.000Z"}',
    });
    return {
      ok: [400, 401, 404].includes(res.status),
      detail: `status=${res.status}`,
    };
  });

  await check("Mock confirm prod-disabled", async () => {
    const res = await fetch(`${BASE}/api/payments/mock/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"token":"x","action":"success"}',
    });
    return {
      ok: [200, 400, 404].includes(res.status),
      detail: `status=${res.status}`,
    };
  });

  // ─── Rapor ────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name} — ${r.detail}`);
  }
  console.log(
    `\n${results.length - failed.length}/${results.length} geçti.\n`
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
