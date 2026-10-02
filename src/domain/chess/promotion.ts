// Opsi promosi pion putih (prototipe: dialog #promotion-dialog, q/r/b/n).
// AI hitam tidak pernah mengisi `promotion` sehingga ia selalu menjadi ratu
// via `normalizePromotion` (perilaku "auto-queen" prototipe dipertahankan).

import type { Board, Side } from './board.ts';

export const PROMOTION_OPTIONS = ['q', 'r', 'b', 'n'] as const;
export type PromotionChoice = (typeof PROMOTION_OPTIONS)[number];

/** Promosi default bila pilihan tidak valid/tidak diisi (prototipe: `'q'`). */
export const DEFAULT_PROMOTION: PromotionChoice = 'q';

export function normalizePromotion(choice: string | null | undefined): PromotionChoice {
  return PROMOTION_OPTIONS.indexOf(choice as PromotionChoice) !== -1
    ? (choice as PromotionChoice)
    : DEFAULT_PROMOTION;
}

/** Baris terakhir dari sudut pandang `side`. */
export function isPromotionRank(side: Side, row: number): boolean {
  return side === 'w' ? row === 0 : row === 7;
}

/** True bila bidak di (fromRow, fromCol) adalah pion yang mencapai baris akhir. */
export function needsPromotion(
  board: Board,
  fromRow: number,
  fromCol: number,
  toRow: number,
): boolean {
  const piece = board[fromRow]?.[fromCol];
  return piece?.type === 'p' && isPromotionRank(piece.side, toRow);
}

/** Daftar opsi promosi untuk UI (urutan sama dengan dialog prototipe). */
export function promotionOptions(): readonly PromotionChoice[] {
  return PROMOTION_OPTIONS;
}

/** Guard tipe untuk langkah yang membawa `promotion`. */
export function isPromotionChoice(value: string): value is PromotionChoice {
  return (PROMOTION_OPTIONS as readonly string[]).indexOf(value) !== -1;
}
