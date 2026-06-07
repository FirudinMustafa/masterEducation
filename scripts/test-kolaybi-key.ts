/**
 * KolayBi API anahtarını ham olarak dener — Channel gerekip gerekmediğini gösterir.
 * KOLAYBI_API_KEY ve (opsiyonel) KOLAYBI_CHANNEL env'den okunur.
 */
const BASE =
  process.env.KOLAYBI_BASE_URL || "https://ofis-sandbox-api.kolaybi.com";
const API_KEY = process.env.KOLAYBI_API_KEY || "";

async function tryAuth(label: string, channel: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (channel) headers["Channel"] = channel;
  try {
    const res = await fetch(`${BASE}/kolaybi/v1/access_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ api_key: API_KEY }),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    console.log(`\n[${label}] status=${res.status}`);
    console.log("  body:", JSON.stringify(body).slice(0, 500));
  } catch (e) {
    console.log(`\n[${label}] NETWORK HATASI:`, e instanceof Error ? e.message : String(e));
  }
}

(async () => {
  console.log("Base:", BASE);
  console.log("API key:", API_KEY ? API_KEY.slice(0, 8) + "..." : "(yok)");
  console.log("Channel (env):", process.env.KOLAYBI_CHANNEL || "(yok)");

  await tryAuth("Channel YOK", null);
  if (process.env.KOLAYBI_CHANNEL) {
    await tryAuth("Channel=env", process.env.KOLAYBI_CHANNEL);
  } else {
    // Channel verilmediyse birkaç olası değer dene — sunucu yanıtı yol gösterir.
    await tryAuth("Channel=web", "web");
    await tryAuth("Channel=api", "api");
  }
})();
