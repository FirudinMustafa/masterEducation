/**
 * "seçtion" / "Seçtion" -> "section" / "Section" revert.
 * (Sec->Seç mapping JSX <section> tag'lerini bozdu.)
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(f.name)) out.push(full);
  }
  return out;
}

const files = walk("src");
let touched = 0;
let total = 0;
const REVERTS = [
  // Tüm İngilizce "sec*" / "Sec*" identifier'larını revert
  // (Turkish "Seç" / "seç" rare ve daha sonra manuel eklenebilir)
  [/Seç(?=[A-Za-z])/g, "Sec"],  // Seçondary, Seçret, Seçtion, Seçtor, Seçure
  [/seç(?=[a-z])/g, "sec"],     // section, secret, second, sector, secure
];

for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const original = content;
  for (const [re, to] of REVERTS) {
    const matches = (original.match(re) ?? []).length;
    if (matches > 0) total += matches;
    content = content.replace(re, to);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    touched++;
  }
}
console.log(`Reverted in ${touched} files, ${total} replacements`);
