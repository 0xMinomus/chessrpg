// Sumber angka acak eksplisit (ARCHITECTURE.md: domain menerima random source
// eksplisit, tidak membaca `Math.random` global).
//
// Pemakaian acak di prototipe chess-rpg-dungeon.html yang nantinya memakai ini:
// - `drawSkill`: undian kartu berbobot (`Math.random() * totalWeight`);
// - `chooseComputerMove`: jitter skor (`Math.random() * 2`) + pilih 1 dari 4
//   teratas (`Math.floor(Math.random() * top.length)`);
// - aturan boss `seal`: pilih 1 kandidat petak (`Math.floor(Math.random() * n)`).

/** Kontrak acak minimal untuk draw kartu dan keputusan AI. */
export interface RandomSource {
  /** Float dalam [0, 1). */
  next(): number;
  /** Integer dalam [0, n). Mengembalikan 0 bila n <= 0. */
  pick(n: number): number;
}

/** RandomSource yang dibungkus di atas `Math.random` (default production). */
export class MathRandom implements RandomSource {
  next(): number {
    return Math.random();
  }
  pick(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(Math.random() * n);
  }
}

/**
 * RandomSource deterministik (mulberry32) untuk reproduksi debugging dan test.
 * `seed` berupa integer 32-bit; stream yang sama selalu menghasilkan urutan sama.
 */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pick(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }
}

/**
 * RandomSource untuk test: mengulang urutan `values` (masing-masing [0, 1)).
 * Nilai di luar rentang dijepit agar `pick` tetap dalam batas.
 */
export function fixedRandom(values: number[]): RandomSource {
  const seq = values.length ? values.slice() : [0];
  let index = 0;
  const clamp = function(v: number): number {
    if (!(v >= 0)) return 0;
    if (!(v < 1)) return 0.999999999;
    return v;
  };
  return {
    next(): number {
      const v = clamp(seq[index % seq.length]);
      index += 1;
      return v;
    },
    pick(n: number): number {
      if (n <= 0) return 0;
      return Math.floor(this.next() * n);
    },
  };
}
