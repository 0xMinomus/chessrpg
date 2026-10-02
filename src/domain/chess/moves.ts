// Validasi langkah catur (domain murni, tanpa DOM/browser).
// Port dari `pseudoMoves`, `simulateMove`, `rawLegalMovesFrom`, `allLegalMoves`,
// `legalMovesFrom`, `captureAt`, `updateCastlingRights`, `isSquareAttacked`,
// `kingPosition`, `isInCheck`, dan bagian papan-murni `commitMove`/`updateOutcome`
// di chess-rpg-dungeon.html. Aturan tidak diubah.
//
// CATATAN PERILAKU YANG DIPERTAHANKAN DARI PROTOTIPE (jangan "diperbaiki"
// diam-diam; perubahan butuh brief terpisah):
// 1. Rokade sisi ratu mensyaratkan petak b-file (kolom 1) juga kosong, padahal
//    menurut catur FIDE petak itu tidak perlu kosong. Dipertahankan apa adanya.
// 2. `allLegalMoves` punya jalan keluar darurat: bila semua langkah tersaring
//    efek kartu/boss padahal raja sedang skak, langkah penyelamat raja tetap
//    dikembalikan (hanya filter blokade yang dipertahankan). Dipertahankan.
// 3. Raja tidak pernah bisa ditangkap (`add` menolak target bertipe 'k'), dan
//    `isInCheck` menganggap raja yang hilang sebagai skak.
// 4. Efek kartu/hero/boss yang mengubah pola gerak (lancer/phase/prism/dll.)
//    dan yang memfilter legalitas (ward/snare/stagger/blockade/seal/aegis)
//    dibaca dari field opsional `MoveState`. Field-field itu dimiliki domain
//    battle; modul ini hanya menempelkan logika papan-murninya.

import type { Board, Piece, PieceType, Side } from './board.ts';
import { isPromotionRank, normalizePromotion } from './promotion.ts';

export type CastleSide = 'k' | 'q';

export interface ChessMove {
  from: [number, number];
  to: [number, number];
  castle?: CastleSide;
  enPassant?: boolean;
  /** Langkah phase/fold: teleport ke petak kosong tanpa menangkap. */
  phase?: boolean;
  promotion?: PieceType;
}

export interface CastlingRights {
  w: { k: boolean; q: boolean };
  b: { k: boolean; q: boolean };
}

export function initialCastlingRights(): CastlingRights {
  return { w: { k: true, q: true }, b: { k: true, q: true } };
}

/**
 * State minimal untuk generator langkah. Field efek bersifat opsional dan
 * diisi domain battle; bila tidak diisi, hasilnya adalah catur standar murni.
 */
export interface MoveState {
  board: Board;
  castling: CastlingRights;
  enPassant: [number, number] | null;
  // --- Hook pola gerak dari kartu/hero ---
  knightTargetId?: number | null;
  prismTargetId?: number | null;
  prismType?: PieceType | null;
  phaseTargetId?: number | null;
  phaseJokerId?: number | null;
  pawnStepId?: number | null;
  heroPawnRushIds?: readonly number[] | null;
  pawnRaidId?: number | null;
  rookBendId?: number | null;
  // --- Hook filter legalitas dari kartu/hero/boss ---
  bossSealedSquare?: [number, number] | null;
  enemyWardPieceId?: number | null;
  pierceArmed?: boolean;
  heroAegisActive?: boolean;
  snareId?: number | null;
  staggerId?: number | null;
  blockadeSquare?: [number, number] | null;
  heroBlockadeSquares?: readonly (readonly [number, number])[];
  playerWardPieceId?: number | null;
}

const FILES = 'abcdefgh';

export function inside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function coord(row: number, col: number): string {
  return FILES[col] + String(8 - row);
}

export function isSquareAttacked(
  board: Board,
  row: number,
  col: number,
  attacker: Side,
): boolean {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece || piece.side !== attacker) continue;
      const dr = row - r;
      const dc = col - c;
      const absDr = Math.abs(dr);
      const absDc = Math.abs(dc);
      if (piece.type === 'p') {
        const direction = attacker === 'w' ? -1 : 1;
        if (dr === direction && absDc === 1) return true;
      } else if (piece.type === 'n') {
        if ((absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2)) return true;
      } else if (piece.type === 'k') {
        if (Math.max(absDr, absDc) === 1) return true;
      } else {
        const diagonal = absDr === absDc && absDr > 0;
        const straight = (dr === 0 && dc !== 0) || (dc === 0 && dr !== 0);
        const canDiagonal = piece.type === 'b' || piece.type === 'q';
        const canStraight = piece.type === 'r' || piece.type === 'q';
        if ((diagonal && canDiagonal) || (straight && canStraight)) {
          const stepRow = Math.sign(dr);
          const stepCol = Math.sign(dc);
          let clear = true;
          for (let step = 1; step < Math.max(absDr, absDc); step += 1) {
            if (board[r + stepRow * step][c + stepCol * step]) { clear = false; break; }
          }
          if (clear) return true;
        }
      }
    }
  }
  return false;
}

export function kingPosition(board: Board, side: Side): [number, number] | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && piece.side === side && piece.type === 'k') return [row, col];
    }
  }
  return null;
}

export function isInCheck(board: Board, side: Side): boolean {
  const king = kingPosition(board, side);
  return !king || isSquareAttacked(board, king[0], king[1], side === 'w' ? 'b' : 'w');
}

export function pseudoMoves(board: Board, state: MoveState, row: number, col: number): ChessMove[] {
  const piece = board[row][col];
  if (!piece) return [];
  const moves: ChessMove[] = [];
  let effectiveType: PieceType = state.knightTargetId === piece.id ? 'n' : piece.type;
  if (state.prismTargetId === piece.id && state.prismType) effectiveType = state.prismType;
  if (state.phaseTargetId === piece.id) {
    const range = state.phaseJokerId === piece.id ? 7 : 2;
    for (let r = Math.max(0, row - range); r <= Math.min(7, row + range); r += 1) {
      for (let c = Math.max(0, col - range); c <= Math.min(7, col + range); c += 1) {
        if ((r !== row || c !== col) && !board[r][c]) moves.push({ from: [row, col], to: [r, c], phase: true });
      }
    }
    return moves;
  }
  const add = function(r: number, c: number): boolean {
    if (!inside(r, c)) return false;
    const target = board[r][c];
    if (!target) { moves.push({ from: [row, col], to: [r, c] }); return true; }
    if (target.side !== piece.side && target.type !== 'k') moves.push({ from: [row, col], to: [r, c] });
    return false;
  };
  const ray = function(dr: number, dc: number): void {
    let r = row + dr;
    let c = col + dc;
    while (inside(r, c)) {
      if (!add(r, c)) break;
      r += dr;
      c += dc;
    }
  };

  if (effectiveType === 'p') {
    const direction = piece.side === 'w' ? -1 : 1;
    const startRow = piece.side === 'w' ? 6 : 1;
    const nextRow = row + direction;
    if (inside(nextRow, col) && !board[nextRow][col]) {
      add(nextRow, col);
      const doubleRow = row + direction * 2;
      if ((row === startRow || state.pawnStepId === piece.id || (state.heroPawnRushIds && state.heroPawnRushIds.indexOf(piece.id) !== -1)) && inside(doubleRow, col) && !board[doubleRow][col]) add(doubleRow, col);
    }
    if (state.pawnRaidId === piece.id) {
      const straightTarget = inside(nextRow, col) ? board[nextRow][col] : null;
      if (straightTarget && straightTarget.side !== piece.side && straightTarget.type !== 'k') add(nextRow, col);
    }
    for (const dc of [-1, 1]) {
      const r = row + direction;
      const c = col + dc;
      if (!inside(r, c)) continue;
      const target = board[r][c];
      if (target && target.side !== piece.side && target.type !== 'k') add(r, c);
      if (!target && state.enPassant && state.enPassant[0] === r && state.enPassant[1] === c) {
        moves.push({ from: [row, col], to: [r, c], enPassant: true });
      }
    }
  } else if (effectiveType === 'n') {
    for (const delta of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) add(row + delta[0], col + delta[1]);
  } else if (effectiveType === 'b' || effectiveType === 'q') {
    ray(-1, -1); ray(-1, 1); ray(1, -1); ray(1, 1);
  }
  if (effectiveType === 'r' || effectiveType === 'q') {
    ray(-1, 0); ray(1, 0); ray(0, -1); ray(0, 1);
  }
  if (piece.type === 'r' && state.rookBendId === piece.id) {
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) add(row + dr, col + dc);
  }
  if (effectiveType === 'k') {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) if (dr !== 0 || dc !== 0) add(row + dr, col + dc);
    }
    const homeRow = piece.side === 'w' ? 7 : 0;
    const opponent: Side = piece.side === 'w' ? 'b' : 'w';
    if (row === homeRow && col === 4 && !isInCheck(board, piece.side)) {
      if (state.castling[piece.side].k && !board[homeRow][5] && !board[homeRow][6]
        && !isSquareAttacked(board, homeRow, 5, opponent) && !isSquareAttacked(board, homeRow, 6, opponent)) {
        moves.push({ from: [row, col], to: [homeRow, 6], castle: 'k' });
      }
      // Quirk prototipe (dipertahankan): sisi ratu juga menuntut b-file kosong.
      if (state.castling[piece.side].q && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]
        && !isSquareAttacked(board, homeRow, 3, opponent) && !isSquareAttacked(board, homeRow, 2, opponent)) {
        moves.push({ from: [row, col], to: [homeRow, 2], castle: 'q' });
      }
    }
  }
  return moves;
}

/** Transformasi papan murni untuk satu langkah (termasuk rokade/en passant/promosi). */
export function simulateMove(board: Board, move: ChessMove): Board {
  const next = board.map(function(row) { return row.slice(); });
  const fromRow = move.from[0], fromCol = move.from[1];
  const toRow = move.to[0], toCol = move.to[1];
  const origin = next[fromRow][fromCol];
  if (!origin) return next;
  const moving: Piece = { ...origin };
  next[fromRow][fromCol] = null;
  if (move.enPassant) next[fromRow][toCol] = null;
  if (move.castle === 'k') { next[fromRow][5] = next[fromRow][7] ? { ...next[fromRow][7] as Piece } : null; next[fromRow][7] = null; }
  else if (move.castle === 'q') { next[fromRow][3] = next[fromRow][0] ? { ...next[fromRow][0] as Piece } : null; next[fromRow][0] = null; }
  if (moving.type === 'p' && isPromotionRank(moving.side, toRow)) {
    moving.type = normalizePromotion(move.promotion);
  }
  next[toRow][toCol] = moving;
  return next;
}

/** Bidak yang tertangkap oleh sebuah langkah (memperhitungkan en passant). */
export function captureAt(state: MoveState, move: ChessMove): Piece | null {
  return move.enPassant
    ? state.board[move.from[0]][move.to[1]]
    : state.board[move.to[0]][move.to[1]];
}

/** Langkah semu yang lolos filter keselamatan raja (tanpa filter efek kartu/boss). */
export function rawLegalMovesFrom(state: MoveState, row: number, col: number): ChessMove[] {
  const piece = state.board[row][col];
  if (!piece) return [];
  return pseudoMoves(state.board, state, row, col).filter(function(move) {
    return !isInCheck(simulateMove(state.board, move), piece.side);
  });
}

/**
 * Semua langkah legal untuk `side`, termasuk filter efek kartu/hero/boss.
 * Lihat catatan #2 di kepala file untuk jalan keluar darurat saat skak.
 */
export function allLegalMoves(state: MoveState, side: Side): ChessMove[] {
  const result: ChessMove[] = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (piece && piece.side === side) result.push(...rawLegalMovesFrom(state, row, col));
    }
  }
  const allowed = result.filter(function(move) {
    const moving = state.board[move.from[0]][move.from[1]];
    if (!moving) return false;
    const captured = captureAt(state, move);
    if (side === 'w') {
      if (state.bossSealedSquare && move.to[0] === state.bossSealedSquare[0] && move.to[1] === state.bossSealedSquare[1]) return false;
      return !captured || captured.id !== state.enemyWardPieceId || state.pierceArmed === true;
    }
    if (state.heroAegisActive && captured && captured.side === 'w') return false;
    if (state.snareId === moving.id) return false;
    if (state.staggerId === moving.id && captured) return false;
    if (state.blockadeSquare && move.to[0] === state.blockadeSquare[0] && move.to[1] === state.blockadeSquare[1]) return false;
    if ((state.heroBlockadeSquares || []).some(function(square) { return move.to[0] === square[0] && move.to[1] === square[1]; })) return false;
    return !captured || captured.id !== state.playerWardPieceId;
  });
  if (allowed.length || result.length === 0 || !isInCheck(state.board, side)) return allowed;
  return result.filter(function(move) {
    const onHeroBlockade = (state.heroBlockadeSquares || []).some(function(square) { return move.to[0] === square[0] && move.to[1] === square[1]; });
    const onCardBlockade = Boolean(state.blockadeSquare && move.to[0] === state.blockadeSquare[0] && move.to[1] === state.blockadeSquare[1]);
    return !onHeroBlockade && !onCardBlockade;
  });
}

export function legalMovesFrom(state: MoveState, row: number, col: number): ChessMove[] {
  const piece = state.board[row][col];
  if (!piece) return [];
  return allLegalMoves(state, piece.side).filter(function(move) {
    return move.from[0] === row && move.from[1] === col;
  });
}

/**
 * Memperbarui hak rokade setelah sebuah langkah (port `updateCastlingRights`).
 * Mengubah objek `rights` yang diberikan, seperti prototipe mengubah
 * `game.castling`.
 */
export function updateCastlingRights(
  rights: CastlingRights,
  piece: Piece,
  fromRow: number,
  fromCol: number,
  captured: Piece | null,
  toRow: number,
  toCol: number,
): void {
  const home = piece.side === 'w' ? 7 : 0;
  if (piece.type === 'k') { rights[piece.side].k = false; rights[piece.side].q = false; }
  if (piece.type === 'r' && fromRow === home) {
    if (fromCol === 0) rights[piece.side].q = false;
    if (fromCol === 7) rights[piece.side].k = false;
  }
  if (captured && captured.type === 'r') {
    const capturedHome = captured.side === 'w' ? 7 : 0;
    if (toRow === capturedHome && toCol === 0) rights[captured.side].q = false;
    if (toRow === capturedHome && toCol === 7) rights[captured.side].k = false;
  }
}

/** Petak en passant yang terbentuk setelah pion maju dua petak (atau null). */
export function enPassantSquareForMove(
  piece: Piece,
  fromRow: number,
  fromCol: number,
  toRow: number,
): [number, number] | null {
  if (piece.type === 'p' && Math.abs(toRow - fromRow) === 2) {
    return [(fromRow + toRow) / 2, fromCol];
  }
  return null;
}

export type GameOutcome =
  | { over: false; winner: null; inCheck: boolean }
  | { over: true; winner: Side | null; inCheck: boolean };

/**
 * Bagian papan-murni `updateOutcome`: skakmat / remis / lanjut.
 * Hadiah koin, save campaign, dan status suara tetap di application layer.
 */
export function getOutcome(state: MoveState, side: Side): GameOutcome {
  const moves = allLegalMoves(state, side);
  const checked = isInCheck(state.board, side);
  if (moves.length === 0) {
    return { over: true, winner: checked ? (side === 'w' ? 'b' : 'w') : null, inCheck: checked };
  }
  return { over: false, winner: null, inCheck: checked };
}
