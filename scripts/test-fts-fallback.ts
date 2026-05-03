/**
 * FTS (full-text search) → ILIKE fallback testi.
 * Kotu bir query'nin ya FTS'i gecmesi ya da fallback'a dusup sonuc dondurmesi
 * beklenir (500 olmasin).
 */
import "dotenv/config";
import { searchProductIds } from "../src/lib/search";

let passed = 0, failed = 0;
function check(name: string, cond: boolean, info?: string) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.log(`  ✗ ${name}${info ? "  " + info : ""}`); failed++; }
}

(async () => {
  console.log("\n=== FTS + FALLBACK TESTLERI ===\n");

  console.log("1) Normal arama — FTS path calisir");
  const r1 = await searchProductIds("english");
  check("total >= 0 (hata atmadi)", typeof r1.total === "number");
  check("ids dizisi geri dondu", Array.isArray(r1.ids));
  console.log(`    total=${r1.total}, ids=${r1.ids.length}`);

  console.log("\n2) Cok kisa query — bos sonuc");
  const r2 = await searchProductIds("a");
  check("q<2 → {ids:[], total:0}", r2.total === 0 && r2.ids.length === 0);

  console.log("\n3) Turkce karakter — calisir");
  const r3 = await searchProductIds("ingilizce");
  check("total >= 0", typeof r3.total === "number");

  console.log("\n4) Kotu karakter (tsquery breaker) — fallback ile sonuc");
  // websearch_to_tsquery('turkish', '!!!' ) genelde parse eder ama bir sey
  // bulmayabilir; bazen parse hatasi atar. Her durumda 500 olmamali.
  const r4 = await searchProductIds("!!!");
  check("exception firlatmadi", typeof r4.total === "number");
  console.log(`    total=${r4.total}`);

  console.log("\n5) Parantez ve operator karisimi");
  const r5 = await searchProductIds("(a & b");
  check("exception firlatmadi", typeof r5.total === "number");

  console.log("\n6) Tam urun SKU ile arama — fallback de calisir");
  const r6 = await searchProductIds("ELT");
  check("total sonucu gelir (FTS veya fallback)", typeof r6.total === "number");

  console.log("\n7) Offset/limit dogru calisiyor");
  const r7a = await searchProductIds("book", { limit: 5, offset: 0 });
  const r7b = await searchProductIds("book", { limit: 5, offset: 5 });
  check("limit=5 → 5 ids (var ise)", r7a.ids.length <= 5);
  check("offset=5 → farkli sonuc seti (total >= 10 ise)", r7b.ids.every((id) => !r7a.ids.includes(id)) || r7a.total < 10);

  console.log(`\n=== SONUC: ${passed} basarili, ${failed} basarisiz ===\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
