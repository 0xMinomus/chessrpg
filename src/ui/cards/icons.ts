// Ikon kartu kini memakai sprite pixel-art dari atlas "Neon Pixel Chess Ability
// Grid.png", yang diiris menjadi satu PNG per kartu di public/assets/card-icons/
// (lihat scripts/slice-card-icons.mjs). Nama berkas = nilai field `icon` kartu di
// src/content/cards.ts dan unik per kartu.

/** URL ikon raster untuk sebuah kartu. `icon` = nama berkas tanpa ekstensi. */
export function cardIconSrc(icon: string): string {
  return '/assets/card-icons/' + icon + '.png';
}

/** Ikon refresh solid agar kedua ujung panah menyatu jelas dengan lingkaran. */
export const REROLL_ICON = '<path d="M17.65 6.35C16.2 4.9 14.21 4 12 4 7.58 4 4 7.58 4 12s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>';
