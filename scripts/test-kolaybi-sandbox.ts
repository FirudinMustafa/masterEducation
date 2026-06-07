/**
 * KolayBi sandbox bağlantı testi.
 *
 * Kullanım:
 *   .env'de KOLAYBI_API_KEY ve KOLAYBI_CHANNEL set'le, ardından:
 *     npx tsx scripts/test-kolaybi-sandbox.ts
 *
 * env yoksa script DRYRUN modunda olduğunu raporlar ve hata vermez.
 *
 * Yapacakları:
 *   1. isConfigured() kontrolü
 *   2. getAccessToken() — auth endpoint'e gerçek istek
 *   3. Token cache reuse'u test (ikinci çağrı network atmasın)
 *   4. Geçersiz API key ile 4xx beklentisi
 */
import "dotenv/config";
import * as kolaybi from "@/lib/adapters/kolaybi";

(async () => {
  let pass = 0;
  let total = 0;
  const fail: string[] = [];
  const check = (n: string, c: boolean, x?: unknown) => {
    total++;
    if (c) {
      pass++;
      console.log(`  ✓ ${n}`);
    } else {
      const m = x !== undefined ? ` — ${typeof x === "string" ? x : JSON.stringify(x).slice(0, 200)}` : "";
      console.log(`  ✗ ${n}${m}`);
      fail.push(n);
    }
  };

  console.log("─── KolayBi sandbox bağlantı testi ───");
  console.log(`  Base URL: ${process.env.KOLAYBI_BASE_URL ?? "https://ofis-sandbox-api.kolaybi.com (default)"}`);

  // ─── 1. Connectivity probe (credentials gerektirmez) ───
  console.log("\n#1 Network probe (credentials gerektirmez)");
  const probe = await kolaybi.probeConnectivity();
  check("Sandbox erişilebilir (DNS + TLS + HTTP)", probe.reachable, probe.details);
  check(
    "Auth endpoint cevap veriyor",
    probe.authEndpointResponds,
    probe.details,
  );
  check(
    "Error format doğru (data/code/message/success)",
    probe.errorFormatMatches,
    probe.details,
  );

  // ─── 2. Adapter behavior ───
  if (!kolaybi.isConfigured()) {
    console.log("\n#2 Adapter DRYRUN testleri");
    check("isConfigured() = false (env yok)", kolaybi.isConfigured() === false);
    try {
      await kolaybi.authedFetch("/test", { method: "GET" });
      check("authedFetch DRYRUN'da error fırlatır", false);
    } catch (err) {
      check(
        "authedFetch DRYRUN'da KolaybiError fırlatır",
        err instanceof kolaybi.KolaybiError && err.message.includes("DRYRUN"),
        err instanceof Error ? err.message : String(err),
      );
    }

    console.log("\n  Sandbox erişilebilir, adapter hazır.");
    console.log("  Gerçek auth/invoice testi için .env'e ekle:");
    console.log("    KOLAYBI_BASE_URL=https://ofis-sandbox-api.kolaybi.com");
    console.log("    KOLAYBI_API_KEY=<your-api-key>");
    console.log("    KOLAYBI_CHANNEL=<your-channel>");

    console.log(`\nÖzet: ${pass}/${total}`);
    process.exit(fail.length > 0 ? 1 : 0);
  }

  // ─── 3. Real sandbox tests (credentials var) ─────────────
  console.log("\n#3 Auth + token cache (gerçek istek)");
  console.log(`  Channel: ${process.env.KOLAYBI_CHANNEL?.slice(0, 8)}...`);

  try {
    const t1 = await kolaybi.getAccessToken();
    check("Auth: access_token alındı", typeof t1 === "string" && t1.length > 20, t1?.slice(0, 30));

    // 2. Cache reuse — ikinci çağrı aynı token döndürmeli
    const t2 = await kolaybi.getAccessToken();
    check("Token cache reuse (aynı token)", t1 === t2);

    // 3. Reset → yeni token (potansiyel olarak farklı)
    kolaybi._resetTokenCache();
    const t3 = await kolaybi.getAccessToken();
    check("Cache reset sonrası yeni token alınır", typeof t3 === "string" && t3.length > 20);
  } catch (err) {
    check(
      "Auth: access_token alındı",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. Hatalı API key (geçici override) ile 4xx
  const realKey = process.env.KOLAYBI_API_KEY!;
  process.env.KOLAYBI_API_KEY = "INVALID_KEY_FOR_TEST";
  kolaybi._resetTokenCache();
  try {
    await kolaybi.getAccessToken();
    check("Geçersiz API key reddedilir", false);
  } catch (err) {
    check(
      "Geçersiz API key reddedilir (4xx)",
      err instanceof kolaybi.KolaybiError && err.status >= 400 && err.status < 500,
      err instanceof Error ? `${(err as kolaybi.KolaybiError).status}: ${err.message}` : String(err),
    );
  }
  process.env.KOLAYBI_API_KEY = realKey;
  kolaybi._resetTokenCache();

  console.log(`\nÖzet: ${pass}/${total}`);
  if (fail.length > 0) {
    console.log("Fails:", fail);
    process.exitCode = 1;
  }
})();
