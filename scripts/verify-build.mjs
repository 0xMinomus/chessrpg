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
  { pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/gi, allowPeer: false },
  { pattern: /\bfetch\s*\(/g, allowPeer: true },
  { pattern: /XMLHttpRequest/g, allowPeer: true },
  { pattern: /WebSocket/g, allowPeer: true },
  { pattern: /navigator\.sendBeacon/g, allowPeer: false },
  { pattern: /EventSource/g, allowPeer: false },
];
const peerTransportChunks = files.filter((file) => /(?:^|[\\/])peerjs-network-[\w-]+\.js$/.test(file));
const entryChunks = files.filter((file) => /(?:^|[\\/])index-[\w-]+\.js$/.test(file));

let failures = 0;
const notes = [];

for (const file of files) {
  if (!['.js', '.html', '.css'].includes(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  const isPeerTransportChunk = /(?:^|[\\/])peerjs-network-[\w-]+\.js$/.test(file);
  for (const check of remotePatterns) {
    if (isPeerTransportChunk && check.allowPeer) continue;
    check.pattern.lastIndex = 0;
    const hits = text.match(check.pattern);
    if (!hits) continue;
    // Izinkan yang jelas bukan request runtime (mis. komentar/namespace xmlns).
    const filtered = hits.filter((hit) => !/localhost|127\.0\.0\.1|www\.w3\.org|schema/i.test(hit));
    if (filtered.length > 0) {
      failures += 1;
      notes.push(file + ' -> ' + filtered.slice(0, 3).join(', '));
    }
  }
}

if (peerTransportChunks.length !== 1) {
  failures += 1;
  notes.push('dist harus memiliki tepat satu chunk peerjs-network yang dimuat terpisah');
}
if (entryChunks.length !== 1) {
  failures += 1;
  notes.push('dist harus memiliki tepat satu entry bundle aplikasi');
} else if (peerTransportChunks.length === 1) {
  const entry = readFileSync(entryChunks[0], 'utf8');
  const peerChunkName = peerTransportChunks[0].split(/[\\/]/).pop();
  if (!peerChunkName || !entry.includes(peerChunkName)) {
    failures += 1;
    notes.push('entry bundle tidak memuat chunk online melalui dynamic import');
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
if (peerTransportChunks.length === 1) {
  const peerChunkName = peerTransportChunks[0].split(/[\\/]/).pop();
  if (peerChunkName && html.includes(peerChunkName)) {
    failures += 1;
    notes.push('dist/index.html memuat chunk PeerJS sebelum pemain memilih mode online');
  }
}

console.log('file dist diperiksa: ' + files.length);
console.log('aset potret di dist: ' + (assetPresent ? 'ada' : 'TIDAK ADA'));
console.log('pola jaringan di luar adapter PeerJS: ' + (failures === 0 ? 'tidak ditemukan' : 'DITEMUKAN'));
for (const note of notes) console.log('  - ' + note);
if (failures > 0) process.exitCode = 1;
