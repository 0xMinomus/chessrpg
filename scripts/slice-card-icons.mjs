// Iris atlas ikon kartu "Neon Pixel Chess Ability Grid.png" (4 kolom x 10 baris,
// 37 sel; urutan sel = urutan CARDS di src/content/cards.ts) menjadi satu PNG
// per kartu di public/assets/card-icons/<icon>.png.
//
// Geometri sel diukur dari garis emas pembatas: konten sel = area di dalam
// border 1px. Kolom: 4 sel; baris: 10 (baris terakhir hanya 1 sel = 'edict').
// Jalankan ulang hanya bila atlas berubah: `node scripts/slice-card-icons.mjs`.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { inflateSync, deflateSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'references', 'artwork', 'Neon Pixel Chess Ability Grid.png');
const OUT = join(ROOT, 'public', 'assets', 'card-icons');

// Urutan ikon = urutan CARDS (satu sumber data). Nama berkas = nilai field icon.
const ORDER = [
  'lancer', 'tempo', 'ration', 'ward',
  'disrupt', 'focus', 'pawnstep', 'mark',
  'pierce', 'shock', 'leech', 'surcharge',
  'counterspell', 'parry', 'riposte', 'reserve',
  'quiet', 'lastLaugh', 'salvage', 'relay',
  'phase', 'prism', 'pawnraid', 'rookbend',
  'stagger', 'snare', 'sacrifice', 'blockade',
  'fortune', 'pawnBreath', 'pawnGuard', 'pawnMark',
  'pawnStagger', 'pawnPulse', 'phoenix', 'fold', 'edict',
];

// Konten sel: [x0, x1] dan [y0, y1] inklusif, di dalam border emas.
const COLS = [
  [11, 193],
  [208, 388],
  [404, 585],
  [600, 782],
];
const ROWS = [
  [9, 189],
  [205, 384],
  [400, 582],
  [598, 778],
  [794, 975],
  [991, 1172],
  [1188, 1371],
  [1387, 1567],
  [1583, 1765],
  [1780, 1963],
];

// ---- dekode PNG (RGB 8-bit, colorType 2) ----
function decodePng(buf) {
  let off = 8;
  let ihdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') ihdr = buf.slice(off + 8, off + 8 + len);
    if (type === 'IDAT') idat.push(buf.slice(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 3;
  const out = Buffer.alloc(w * h * 3);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? out[y * stride + x - 3] : 0;
      const up = prev ? prev[x] : 0;
      const ul = prev && x >= 3 ? prev[x - 3] : 0;
      let v = line[x];
      if (f === 1) v += left;
      else if (f === 2) v += up;
      else if (f === 3) v += (left + up) >> 1;
      else if (f === 4) v += paeth(left, up, ul);
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, data: out };
}

// ---- enkode PNG (RGB 8-bit) ----
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const atlas = decodePng(readFileSync(SRC));
mkdirSync(OUT, { recursive: true });

let n = 0;
for (let r = 0; r < ROWS.length; r++) {
  const [y0, y1] = ROWS[r];
  const colsInRow = r === 9 ? 1 : 4; // baris terakhir hanya 'edict'
  for (let c = 0; c < colsInRow; c++) {
    const [x0, x1] = COLS[c];
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const crop = Buffer.alloc(cw * ch * 3);
    for (let y = 0; y < ch; y++) {
      const srcOff = ((y0 + y) * atlas.w + x0) * 3;
      crop.fill(atlas.data.subarray(srcOff, srcOff + cw * 3), y * cw * 3, (y + 1) * cw * 3);
    }
    const id = ORDER[n++];
    writeFileSync(join(OUT, id + '.png'), encodePng(cw, ch, crop));
  }
}
if (n !== 37) throw new Error('Jumlah sel teriris ' + n + ' != 37');
console.log('OK: 37 ikon kartu ditulis ke public/assets/card-icons/');
