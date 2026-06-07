import fs from "node:fs";
import path from "node:path";

const RUN_DIR = process.env.QA_RUN_DIR ?? "2026-05-18-2228";
const ROOT = path.resolve(process.cwd(), `qa-run/${RUN_DIR}`);
const FINDINGS_DIR = path.join(ROOT, "findings");

type Finding = {
  id?: string;
  title: string;
  category: string;
  severity: "P0" | "P1" | "P2" | "P3";
  role?: string;
  url?: string;
  steps?: string[];
  expected?: string;
  actual?: string;
  evidence?: string;
  suggested_fix?: string;
  workflow?: string;
  source?: string;
  status?: string;
};

const files = fs.readdirSync(FINDINGS_DIR).filter((f) => f.endsWith(".jsonl") && f !== "findings.jsonl");
const all: Finding[] = [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(FINDINGS_DIR, f), "utf8").split("\n").filter(Boolean);
  for (const ln of lines) {
    try { all.push(JSON.parse(ln) as Finding); } catch { /* skip */ }
  }
}

// Dedup by title+url
const dedupKey = (f: Finding) => `${f.title}::${f.url ?? ""}`;
const dedupMap = new Map<string, { f: Finding; count: number }>();
for (const f of all) {
  const k = dedupKey(f);
  const ex = dedupMap.get(k);
  if (ex) ex.count++;
  else dedupMap.set(k, { f, count: 1 });
}
const deduped = Array.from(dedupMap.values());

// Severity bucket
const bySev: Record<string, Array<{ f: Finding; count: number }>> = { P0: [], P1: [], P2: [], P3: [] };
for (const item of deduped) {
  (bySev[item.f.severity] ?? bySev.P2).push(item);
}

// Write combined findings.jsonl
const combined = path.join(FINDINGS_DIR, "findings.jsonl");
fs.writeFileSync(combined, deduped.map(({ f, count }) => JSON.stringify({ ...f, count })).join("\n") + "\n");

// Summary tally
const tally = {
  total: all.length,
  dedup: deduped.length,
  P0: bySev.P0.length,
  P1: bySev.P1.length,
  P2: bySev.P2.length,
  P3: bySev.P3.length,
  byCategory: {} as Record<string, number>,
  byRole: {} as Record<string, number>,
  byWorkflow: {} as Record<string, number>,
};
for (const item of deduped) {
  const c = item.f.category ?? "uncategorized";
  tally.byCategory[c] = (tally.byCategory[c] ?? 0) + 1;
  const r = item.f.role ?? "unknown";
  tally.byRole[r] = (tally.byRole[r] ?? 0) + 1;
  const w = item.f.workflow ?? item.f.source ?? "unknown";
  tally.byWorkflow[w] = (tally.byWorkflow[w] ?? 0) + 1;
}

// Decide GO/NO-GO
const decision = bySev.P0.length > 0 ? "NO-GO" : bySev.P1.length > 10 ? "GO-with-caveats" : "GO";

// Write REPORT.md
const lines: string[] = [];
lines.push("# Master Education — QA Orkestra Raporu");
lines.push("");
lines.push(`**Koşu zamanı:** ${RUN_DIR}`);
lines.push(`**DB:** Neon dev (ep-bitter-bread-anjdca83)`);
lines.push(`**Tarayıcı:** Chromium (Playwright)`);
lines.push(`**Roller test edilen:** anonim, müşteri (qa-fixture-customer), bayi (PENDING/APPROVED/REJECTED/SUSPENDED fixtures), admin`);
lines.push("");
lines.push(`## Karar: **${decision}**`);
lines.push("");
if (decision === "NO-GO") {
  lines.push(`> P0 (kritik) bulgu sayısı: ${bySev.P0.length}. Production'a alınmadan önce çözülmeli.`);
} else if (decision === "GO-with-caveats") {
  lines.push(`> P0 yok, ancak ${bySev.P1.length} P1 bulgu mevcut. Yayına alınabilir ama 30 gün içinde temizlenmeli.`);
} else {
  lines.push(`> Production'a alınabilir. ${bySev.P1.length} P1 bulgu opsiyonel polish.`);
}
lines.push("");
lines.push("## Özet Tablosu");
lines.push("");
lines.push(`| Severity | Adet |`);
lines.push(`|---|---|`);
lines.push(`| P0 (kritik) | **${tally.P0}** |`);
lines.push(`| P1 (yüksek) | **${tally.P1}** |`);
lines.push(`| P2 (orta) | ${tally.P2} |`);
lines.push(`| P3 (düşük) | ${tally.P3} |`);
lines.push(`| **Toplam (dedup)** | **${tally.dedup}** |`);
lines.push(`| Ham (dedup öncesi) | ${tally.total} |`);
lines.push("");

lines.push("## Kategoriye göre");
lines.push("");
lines.push("| Kategori | Adet |");
lines.push("|---|---|");
for (const [c, n] of Object.entries(tally.byCategory).sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${c} | ${n} |`);
}
lines.push("");

lines.push("## İş Akışına göre (kaynak agent)");
lines.push("");
lines.push("| Workflow / Agent | Adet |");
lines.push("|---|---|");
for (const [w, n] of Object.entries(tally.byWorkflow).sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${w} | ${n} |`);
}
lines.push("");

// P0 detail
lines.push("---");
lines.push("");
lines.push(`## P0 — Kritik (${bySev.P0.length})`);
lines.push("");
if (bySev.P0.length === 0) {
  lines.push("_Yok._");
} else {
  for (const { f, count } of bySev.P0.sort((a, b) => b.count - a.count)) {
    lines.push(`### ${f.id ?? "(no-id)"} — ${f.title}`);
    if (count > 1) lines.push(`_Aynı sorun ${count}x kayıt edildi (farklı agent/koşu)._`);
    lines.push("");
    if (f.role) lines.push(`- **Rol:** ${f.role}`);
    if (f.url) lines.push(`- **URL:** \`${f.url}\``);
    if (f.workflow) lines.push(`- **Kaynak:** ${f.workflow}`);
    if (f.steps && f.steps.length) {
      lines.push(`- **Adımlar:**`);
      for (const s of f.steps) lines.push(`  1. ${s}`);
    }
    if (f.expected) lines.push(`- **Beklenen:** ${f.expected}`);
    if (f.actual) lines.push(`- **Gerçek:** ${f.actual}`);
    if (f.evidence) lines.push(`- **Kanıt:** \`${f.evidence}\``);
    if (f.suggested_fix) lines.push(`- **Önerilen düzeltme:** ${f.suggested_fix}`);
    lines.push("");
  }
}

// P1 detail (top 20)
lines.push("---");
lines.push("");
lines.push(`## P1 — Yüksek (${bySev.P1.length}, ilk 20 detayda)`);
lines.push("");
const p1Sorted = bySev.P1.sort((a, b) => b.count - a.count);
for (const { f, count } of p1Sorted.slice(0, 20)) {
  lines.push(`### ${f.id ?? "(no-id)"} — ${f.title}`);
  if (count > 1) lines.push(`_×${count}_`);
  if (f.role) lines.push(`- **Rol:** ${f.role} | **URL:** \`${f.url ?? "n/a"}\` | **Kaynak:** ${f.workflow ?? "?"}`);
  if (f.expected) lines.push(`- **Beklenen:** ${f.expected}`);
  if (f.actual) lines.push(`- **Gerçek:** ${(f.actual ?? "").slice(0, 250)}`);
  if (f.suggested_fix) lines.push(`- **Öneri:** ${f.suggested_fix}`);
  lines.push("");
}
if (p1Sorted.length > 20) {
  lines.push(`_(${p1Sorted.length - 20} ek P1 finding findings.jsonl içinde.)_`);
  lines.push("");
}

// P2/P3 clusters (just counts by title prefix)
lines.push("---");
lines.push("");
lines.push(`## P2/P3 — Cluster özeti`);
lines.push("");
const clusters: Record<string, number> = {};
for (const { f, count } of [...bySev.P2, ...bySev.P3]) {
  const key = (f.title ?? "").split(/[—:(]/)[0].trim().slice(0, 60);
  clusters[key] = (clusters[key] ?? 0) + count;
}
lines.push("| Cluster | Toplam |");
lines.push("|---|---|");
for (const [k, n] of Object.entries(clusters).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  lines.push(`| ${k} | ${n} |`);
}
lines.push("");

lines.push("---");
lines.push("");
lines.push("## Kapsam");
lines.push("");
lines.push("**Test edilen alanlar:**");
lines.push("- 15+ public/auth sayfa (tarayıcı gezisi)");
lines.push("- 8 viewport × 15 sayfa = 120 responsive screenshot");
lines.push("- Tüm major formlar (kayıt, giriş, bayi başvuru, iletişim, KVKK, profil, adres, checkout)");
lines.push("- W1, W2a, W3, W4, W6, W7, W8, W10, W15, W19, W20 senaryoları");
lines.push("- axe-core WCAG 2.1 AA scan × 15 sayfa");
lines.push("- Bayi 4 statüsünün hepsi (PENDING, APPROVED, REJECTED, SUSPENDED)");
lines.push("- Admin paneline giriş");
lines.push("");
lines.push("**Test edilmeyen / bilinen kapsam dışı:**");
lines.push("- Gerçek iyzico ödeme entegrasyonu (mock kullanıldı)");
lines.push("- Gerçek e-fatura (KolayBi sandbox kullanıldı)");
lines.push("- Gerçek mail gönderimi (Resend DRYRUN modunda)");
lines.push("- Mobil tarayıcı (sadece Chromium desktop)");
lines.push("- Performance/yük testi (sadece functional)");
lines.push("");

lines.push("---");
lines.push("");
lines.push("## Dosya konumları");
lines.push("");
lines.push(`- Tüm findings (JSONL): \`qa-run/${RUN_DIR}/findings/findings.jsonl\``);
lines.push(`- Kaynak agent dosyaları: \`qa-run/${RUN_DIR}/findings/findings-*.jsonl\``);
lines.push(`- Screenshot kanıtları: \`qa-run/${RUN_DIR}/evidence/\``);
lines.push(`- Playwright HTML raporu: \`qa-run/${RUN_DIR}/reports/playwright-html/\``);
lines.push("");

const reportPath = path.join(ROOT, "REPORT.md");
fs.writeFileSync(reportPath, lines.join("\n"));

console.log(`OK. Wrote ${reportPath}`);
console.log(`  Total findings: ${tally.total}, dedup: ${tally.dedup}`);
console.log(`  P0=${tally.P0}, P1=${tally.P1}, P2=${tally.P2}, P3=${tally.P3}`);
console.log(`  Decision: ${decision}`);
