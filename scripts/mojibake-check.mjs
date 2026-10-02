// Audit mojibake: mencari karakter UTF-8 yang ter-double-encode.
// Contoh: bullet U+2022 jadi "a-circumflex + euro + cent" (3 karakter).
//
// Jalankan: node scripts/mojibake-check.mjs [path ...]

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const roots = process.argv.slice(2);
const targets = roots.length > 0 ? roots : ['src', 'index.html', 'MEMORY.md', 'TODO.md', 'PLAN.md'];
const TEXT_EXT = new Set(['.ts', '.css', '.html', '.md', '.json', '.mjs', '.js']);
const MARKS = ['â', 'Ã']; // U+00E2, U+00C3

function looksMojibake(text) {
  for (let i = 0; i < text.length - 1; i += 1) {
    if (MARKS.includes(text[i]) && text.charCodeAt(i + 1) > 0x7f) return true;
  }
  return false;
}

function repairLine(line) {
  try {
    const fixed = Buffer.from(line, 'latin1').toString('utf8');
    return looksMojibake(fixed) ? null : fixed;
  } catch {
    return null;
  }
}

function walk(target) {
  const full = join(process.cwd(), target);
  if (!statSync(full).isFile()) {
    for (const entry of readdirSync(full)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      walk(join(target, entry));
    }
    return;
  }
  if (!TEXT_EXT.has(extname(full))) return;
  const text = readFileSync(full, 'utf8');
  if (!looksMojibake(text)) return;
  const lines = text.split('\n');
  const bad = [];
  const fixedLines = lines.map((line, index) => {
    if (!looksMojibake(line)) return line;
    const repaired = repairLine(line);
    bad.push({ line: index + 1, before: line.trim().slice(0, 70), repaired: repaired !== null });
    return repaired ?? line;
  });
  if (process.argv.includes('--fix')) {
    writeFileSync(full, fixedLines.join('\n'));
    console.log('diperbaiki: ' + target);
  }
  for (const item of bad) {
    console.log(
      (item.repaired ? 'BISA-DIPULIHKAN ' : 'PERLU-DITINJAU ') +
        target +
        ':' +
        item.line +
        ' :: ' +
        item.before,
    );
  }
}

for (const target of targets) walk(target);
console.log('audit selesai');
