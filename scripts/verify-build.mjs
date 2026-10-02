// Verifikasi build statis: memastikan dist tidak pernah memanggil layanan
// remote saat gameplay (NFR-04) dan aset lokal ikut ter-bundle.
//
// Jalankan: node scripts/verify-build.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = 'dist';
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
}

walk(dist);

const remotePatterns = [
  /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/gi,
  /\bfetch\s*\(/g,
  /XMLHttpRequest/g,
  /WebSocket/g,
  /navigator\.sendBeacon/g,
  /EventSource/g,
];

let failures = 0;
const notes = [];

for (const file of files) {
  if (!['.js', '.html', '.css'].includes(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  for (const pattern of remotePatterns) {
    pattern.lastIndex = 0;
    const hits = text.match(pattern);
    if (!hits) continue;
    // Izinkan yang jelas bukan request runtime (mis. komentar/namespace xmlns).
    const filtered = hits.filter((hit) => !/localhost|127\.0\.0\.1|www\.w3\.org|schema/i.test(hit));
    if (filtered.length > 0) {
      failures += 1;
      notes.push(file + ' -> ' + filtered.slice(0, 3).join(', '));
    }
  }
}

const assetPresent = files.some((file) => file.endsWith('hero-potraits-new.png'));
if (!assetPresent) {
  failures += 1;
  notes.push('public/assets/hero-potraits-new.png tidak ikut ter-bundle ke dist');
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
if (!html.includes('id="app"')) {
  failures += 1;
  notes.push('dist/index.html tidak memuat #app');
}

console.log('file dist diperiksa: ' + files.length);
console.log('aset potret di dist: ' + (assetPresent ? 'ada' : 'TIDAK ADA'));
console.log('pola jaringan remote: ' + (failures === 0 ? 'tidak ditemukan' : 'DITEMUKAN'));
for (const note of notes) console.log('  - ' + note);
if (failures > 0) process.exitCode = 1;
